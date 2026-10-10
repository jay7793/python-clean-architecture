import { screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import type { AuthApi } from '../../application/ports'
import { ApiError } from '../../domain/errors'
import type { NewAccount } from '../../domain/user'
import { ada, firstPair, overviewOf } from '../../test/fakes'
import { renderApp } from '../../test/renderApp'

const grace = {
  ...ada,
  id: 9,
  email: 'grace@example.com',
  first_name: 'Grace',
  last_name: 'Hopper',
  created_at: '2026-10-10T09:00:00Z',
  updated_at: '2026-10-10T09:00:00Z',
}

const openAt = (path: string, api: Partial<AuthApi> = {}) =>
  renderApp({ path, tokens: firstPair, api: { profile: async () => ada, ...api } })

async function fillIn(app: Awaited<ReturnType<typeof openAt>>) {
  await app.fill('First name', 'Grace')
  await app.fill('Last name', 'Hopper')
  await app.fill('Email', grace.email)
  await app.fill('Password', 'grace-pass')
}

describe('NewUserPage', () => {
  it('is reached from a New user button above the users table', async () => {
    const { user } = await openAt('/users', {
      listAdminUsers: async () => ({ data: [overviewOf(ada)], page: 1, page_size: 10, total_page: 1, total_data: 1 }),
    })

    await user.click(await screen.findByRole('link', { name: 'New user' }))

    expect(await screen.findByRole('heading', { level: 1, name: 'New user' })).toBeInTheDocument()
    expect(screen.getByRole('switch', { name: 'Administrator' })).not.toBeChecked()
  })

  it('offers no New user button to an account the API refuses as not an admin', async () => {
    await openAt('/users', { listAdminUsers: () => Promise.reject(new ApiError(403, 'middleware-004', 'admin permission required')) })

    await screen.findByRole('heading', { name: 'This account is not an admin' })
    expect(screen.queryByRole('link', { name: 'New user' })).not.toBeInTheDocument()
  })

  it('names each missing or invalid field and sends nothing', async () => {
    const app = await openAt('/users/new')

    await app.fill('Email', 'not-an-email')
    await app.user.click(screen.getByRole('button', { name: 'Create user' }))

    expect(await screen.findByText('Enter a first name.')).toBeInTheDocument()
    expect(screen.getByText('Enter a last name.')).toBeInTheDocument()
    expect(screen.getByText('Enter a valid email address.')).toBeInTheDocument()
    expect(screen.getByText('Set a password for this user.')).toBeInTheDocument()
    expect(app.calls.filter((c) => c.op === 'createUser')).toEqual([])
  })

  it('creates the user and opens their page with a confirmation', async () => {
    const sent: NewAccount[] = []
    const app = await openAt('/users/new', {
      createUser: async (_ref, _access, input) => {
        sent.push(input)
        return { ...grace, is_admin: input.is_admin, protected: false }
      },
      getUserOverview: async () => overviewOf(grace),
    })

    await fillIn(app)
    await app.user.click(screen.getByRole('switch', { name: 'Administrator' }))
    await app.user.click(screen.getByRole('button', { name: 'Create user' }))

    expect(await screen.findByRole('heading', { level: 1, name: 'Grace Hopper' })).toBeInTheDocument()
    expect(screen.getByRole('status')).toHaveTextContent('Created Grace Hopper. They can sign in with grace@example.com and the password you set.')
    expect(sent).toEqual([
      { first_name: 'Grace', last_name: 'Hopper', email: grace.email, password: 'grace-pass', is_admin: true },
    ])
  })

  it('marks the new row when the admin goes back to the list', async () => {
    let created = false
    const app = await openAt('/users/new', {
      createUser: async () => {
        created = true
        return { ...grace, is_admin: false, protected: false }
      },
      getUserOverview: async () => overviewOf(grace),
      listAdminUsers: async () => {
        const rows = [overviewOf(ada), ...(created ? [overviewOf(grace)] : [])]
        return { data: rows, page: 1, page_size: 10, total_page: 1, total_data: rows.length }
      },
    })
    await fillIn(app)
    await app.user.click(screen.getByRole('button', { name: 'Create user' }))
    await screen.findByRole('heading', { level: 1, name: 'Grace Hopper' })

    await app.user.click(screen.getByRole('link', { name: 'Back to Users' }))

    const table = await screen.findByRole('table', { name: 'Users' })
    expect(within(table).getByRole('link', { name: 'View Grace Hopper' }).closest('tr')).toHaveAttribute('data-recent')
    expect(within(table).getByRole('link', { name: 'View Ada Lovelace' }).closest('tr')).not.toHaveAttribute('data-recent')
  })

  it('goes back to the last page, where the new user lands, when the list has more than one page', async () => {
    const pages: number[] = []
    const app = await openAt('/users/new', {
      createUser: async () => ({ ...grace, id: 30, is_admin: false, protected: false }),
      getUserOverview: async () => overviewOf({ ...grace, id: 30 }),
      listAdminUsers: async (_ref, _access, page) => {
        pages.push(page)
        const rows = page === 3 ? [overviewOf({ id: 29, email: 'edsger@example.com' }), overviewOf({ ...grace, id: 30 })] : [overviewOf({ id: page, email: `user${page}@example.com` })]
        return { data: rows, page, page_size: 10, total_page: 3, total_data: 22 }
      },
    })
    await fillIn(app)
    await app.user.click(screen.getByRole('button', { name: 'Create user' }))
    await screen.findByRole('heading', { level: 1, name: 'Grace Hopper' })

    await app.user.click(screen.getByRole('link', { name: 'Back to Users' }))

    expect(await screen.findByText('Page 3 of 3 · 22 rows')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'View Grace Hopper' }).closest('tr')).toHaveAttribute('data-recent')
    expect(pages).toEqual([1, 3])
  })

  it('shows a taken email with its trace_id and keeps the form', async () => {
    const app = await openAt('/users/new', {
      createUser: () => Promise.reject(new ApiError(409, 'users-001', 'email already used')),
    })

    await fillIn(app)
    await app.user.click(screen.getByRole('button', { name: 'Create user' }))

    const alert = await screen.findByRole('alert')
    expect(within(alert).getByText('This email already has an account. Use a different email.')).toBeInTheDocument()
    expect(alert).toHaveTextContent('HTTP 409 · trace_id users-001 · email already used')
    expect(screen.getByLabelText('Email')).toHaveValue(grace.email)
  })
})
