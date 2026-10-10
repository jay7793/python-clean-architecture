import { screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import type { AuthApi } from '../../application/ports'
import { ApiError } from '../../domain/errors'
import type { UserOverview } from '../../domain/user'
import { ada, firstPair, overviewOf } from '../../test/fakes'
import { renderApp } from '../../test/renderApp'

const pageOf = <T,>(page: number, rows: T[]) => ({
  data: rows,
  page,
  page_size: 10,
  total_page: 2,
  total_data: 10 + rows.length,
})

const userRow = (id: number) => overviewOf({ id, email: `user${id}@example.com` })

const signedInAt = (listAdminUsers: AuthApi['listAdminUsers']) =>
  renderApp({ path: '/users', tokens: firstPair, api: { profile: async () => ada, listAdminUsers } })

const minutesAgo = (minutes: number) => new Date(Date.now() - minutes * 60_000).toISOString()

describe('UsersPage', () => {
  it('pages through users with _page and _pageSize', async () => {
    const { user, calls } = await signedInAt(async (_ref, _access, page) => pageOf(page, [userRow(page)]))

    const table = await screen.findByRole('table', { name: 'Users' })
    expect(within(table).getByText('user1@example.com')).toBeInTheDocument()
    expect(screen.getByText('Page 1 of 2 · 11 rows')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Next page' }))

    expect(await screen.findByText('user2@example.com')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Next page' })).toBeDisabled()
    expect(calls.filter((c) => c.op === 'listAdminUsers')).toHaveLength(2)
  })

  it('links each user row to that user from their name', async () => {
    await signedInAt(async () => pageOf(1, [overviewOf(ada)]))

    const table = await screen.findByRole('table', { name: 'Users' })
    const link = within(table).getByRole('link', { name: 'View Ada Lovelace' })
    expect(link).toHaveAttribute('href', '/users/1')
    expect(link).toHaveTextContent('Ada Lovelace')
  })

  it('opens the page named in ?page= and pages back from it', async () => {
    const pages: number[] = []
    const { user } = await renderApp({
      path: '/users?page=2',
      tokens: firstPair,
      api: {
        profile: async () => ada,
        listAdminUsers: async (_ref, _access, page) => {
          pages.push(page)
          return pageOf(page, [userRow(page)])
        },
      },
    })

    expect(await screen.findByText('Page 2 of 2 · 11 rows')).toBeInTheDocument()
    expect(pages).toEqual([2])
    await user.click(screen.getByRole('button', { name: 'Previous page' }))

    expect(await screen.findByText('Page 1 of 2 · 11 rows')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'View User 1' })).toHaveAttribute('href', '/users/1')
  })

  it("shows each user's role, session and last sign-in, most telling columns first", async () => {
    const createdAt = '2026-10-09T12:00:00.000000Z'
    const admin = overviewOf(ada, {
      created_at: createdAt,
      role: 'admin',
      session: { active: true, last_active_at: minutesAgo(5) },
      last_sign_in_at: minutesAgo(120),
    })
    const grace = overviewOf({ id: 2, email: 'grace@example.com', first_name: 'Grace', last_name: 'Hopper', created_at: createdAt })
    await signedInAt(async () => pageOf(1, [admin, grace]))

    const table = await screen.findByRole('table', { name: 'Users' })
    expect(within(table).getAllByRole('columnheader').map((th) => th.textContent)).toEqual(['Name', 'Role', 'Session', 'Last sign-in', 'Email', 'Created'])
    const [adaRow, graceRow] = within(table).getAllByRole('row').slice(1).map((tr) => within(tr).getAllByRole('cell'))
    expect(adaRow?.slice(0, 5).map((td) => td.textContent)).toEqual(['Ada Lovelace', 'Admin', 'Active · 5 minutes ago', '2 hours ago', ada.email])
    expect(graceRow?.slice(0, 5).map((td) => td.textContent)).toEqual(['Grace Hopper', 'Member', 'Signed out', 'No sign-in recorded', 'grace@example.com'])
    const lastSignIn = adaRow?.[3]?.querySelector('time')
    expect(lastSignIn).toHaveAttribute('dateTime', admin.last_sign_in_at)
    expect(lastSignIn?.getAttribute('title')).toMatch(/^[A-Z][a-z]{2} \d{1,2}, \d{4}, /)
    expect(adaRow?.[2]?.querySelector('time')).toHaveAttribute('dateTime', admin.session.last_active_at)
    const created = adaRow?.[5]?.querySelector('time')
    expect(created).toHaveAttribute('dateTime', createdAt)
    expect(created).toHaveTextContent(/^Oct 9, 2026, /)
  })

  it('shows a signed-out session that was once used as Signed out', async () => {
    const expired = overviewOf(ada, { session: { active: false, last_active_at: minutesAgo(90) }, last_sign_in_at: minutesAgo(90) })
    await signedInAt(async () => pageOf(1, [expired]))

    const table = await screen.findByRole('table', { name: 'Users' })
    const cells = within(within(table).getAllByRole('row')[1] as HTMLElement).getAllByRole('cell')
    expect(cells[2]).toHaveTextContent(/^Signed out$/)
  })

  it('teaches how to become an admin when the API answers 403 middleware-004', async () => {
    await signedInAt(() => Promise.reject(new ApiError(403, 'middleware-004', 'admin permission required')))

    expect(await screen.findByRole('heading', { name: 'This account is not an admin' })).toBeInTheDocument()
    const command = `uv run python -m app.infrastructure.cli grant-permission ${ada.email} admin`
    expect(screen.getByText((_, element) => element?.tagName === 'CODE' && element.textContent === command)).toBeInTheDocument()
    expect(screen.getByText('middleware-004')).toBeInTheDocument()
    expect(screen.queryByRole('table')).not.toBeInTheDocument()
  })

  it('says where users come from when there are none', async () => {
    await signedInAt(async () => ({ data: [] as UserOverview[], page: 1, page_size: 10, total_page: 0, total_data: 0 }))

    expect(await screen.findByRole('heading', { name: 'No users yet' })).toBeInTheDocument()
    expect(screen.getByText('Accounts appear here after they register.')).toBeInTheDocument()
    expect(screen.queryByRole('table')).not.toBeInTheDocument()
  })
})
