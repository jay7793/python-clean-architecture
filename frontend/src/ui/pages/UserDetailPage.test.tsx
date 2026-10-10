import { screen, waitFor, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import type { AuthApi } from '../../application/ports'
import { ApiError } from '../../domain/errors'
import { ada, firstPair, overviewOf } from '../../test/fakes'
import { renderApp } from '../../test/renderApp'

const row = overviewOf({ ...ada, id: 7, created_at: '2026-10-09T12:00:00Z', updated_at: '2026-10-10T08:30:00Z' })
const DEMO_LOCKED = 'Demo account: editing, deleting and revoking are turned off so the demo keeps working.'
const minutesAgo = (minutes: number) => new Date(Date.now() - minutes * 60_000).toISOString()

function fields(card: HTMLElement): Record<string, string | null | undefined> {
  const terms = within(card).getAllByRole('term').map((term) => term.textContent)
  const values = within(card).getAllByRole('definition').map((value) => value.textContent)
  return Object.fromEntries(terms.map((term, i) => [term, values[i]]))
}

const openAt = (path: string, api: Partial<AuthApi>) => renderApp({ path, tokens: firstPair, api: { profile: async () => ada, ...api } })

describe('UserDetailPage', () => {
  it('shows the user the API returned under Admin / Users, with Users still current', async () => {
    const { calls } = await openAt('/users/7', { getUserOverview: async () => row })

    expect(await screen.findByRole('heading', { level: 1, name: 'Ada Lovelace' })).toBeInTheDocument()
    expect(screen.getByRole('navigation', { name: 'Breadcrumb' })).toHaveTextContent('Admin/Users/')
    const card = screen.getByRole('region', { name: 'Ada Lovelace' })
    expect(card).toHaveTextContent('GET /api/v1/admin/users/7/overview')
    expect(fields(card)).toMatchObject({ Email: ada.email, ID: '7', Role: 'Member', Session: 'Signed out' })
    const times = [...card.querySelectorAll('time')].map((time) => time.dateTime)
    expect(times).toEqual([row.created_at, row.updated_at])
    const sidebar = screen.getByRole('navigation', { name: 'Main' })
    expect(within(sidebar).getByRole('link', { name: 'Users' })).toHaveAttribute('aria-current', 'page')
    expect(screen.getByRole('link', { name: 'Back to Users' })).toHaveAttribute('href', '/users')
    expect(calls.filter((c) => c.op === 'getUserOverview')).toHaveLength(1)
  })

  it('shows an admin with an active session and when it was last used', async () => {
    const activeAt = minutesAgo(5)
    await openAt('/users/7', { getUserOverview: async () => ({ ...row, role: 'admin', session: { active: true, last_active_at: activeAt } }) })

    const card = await screen.findByRole('region', { name: 'Ada Lovelace' })
    expect(fields(card)).toMatchObject({ Role: 'Admin', Session: 'Active · 5 minutes ago' })
    expect(within(card).getByText('5 minutes ago').closest('time')).toHaveAttribute('dateTime', activeAt)
  })

  it('draws a shimmering skeleton of the card while the row loads', async () => {
    await openAt('/users/7', { getUserOverview: () => new Promise(() => undefined) })

    expect(await screen.findByLabelText('Loading user')).toHaveAttribute('aria-busy', 'true')
  })

  it('says the user was not found on 404 users-005, with the trace_id and a way back', async () => {
    await openAt('/users/99999', { getUserOverview: () => Promise.reject(new ApiError(404, 'users-005', 'user not found')) })

    expect(await screen.findByRole('heading', { name: 'User not found' })).toBeInTheDocument()
    expect(screen.getByText('users-005')).toBeInTheDocument()
    expect(screen.getAllByRole('link', { name: 'Back to Users' })[0]).toHaveAttribute('href', '/users')
  })

  it('teaches how to become an admin on 403 middleware-004', async () => {
    await openAt('/users/7', { getUserOverview: () => Promise.reject(new ApiError(403, 'middleware-004', 'admin permission required')) })

    expect(await screen.findByRole('heading', { name: 'This account is not an admin' })).toBeInTheDocument()
    expect(screen.getByText('middleware-004')).toBeInTheDocument()
  })

  it('links back to the list page it was opened from', async () => {
    const pages: number[] = []
    const { user } = await openAt('/users?page=2', {
      listAdminUsers: async (_ref, _access, page) => {
        pages.push(page)
        return { data: [overviewOf(row)], page, page_size: 10, total_page: 2, total_data: 11 }
      },
      getUserOverview: async () => row,
    })

    await user.click(await screen.findByRole('link', { name: 'View Ada Lovelace' }))
    const back = await screen.findByRole('link', { name: 'Back to Users' })
    expect(back).toHaveAttribute('href', '/users?page=2')

    await user.click(back)
    expect(await screen.findByText('Page 2 of 2 · 11 rows')).toBeInTheDocument()
    expect(pages).toEqual([2, 2])
  })
})

describe('deleting a user', () => {
  const grace = { ...row, email: 'grace@example.com', first_name: 'Grace', last_name: 'Hopper' }
  const listRow = overviewOf(grace)

  it('asks first, naming the user, and Cancel sends nothing', async () => {
    const { user, calls } = await openAt('/users/7', { getUserOverview: async () => grace })

    await user.click(await screen.findByRole('button', { name: 'Delete' }))

    const dialog = await screen.findByRole('alertdialog', { name: 'Delete Grace Hopper?' })
    expect(dialog).toHaveTextContent('This removes their account and ends their session.')
    await user.click(within(dialog).getByRole('button', { name: 'Cancel' }))
    await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument())
    expect(calls.filter((c) => c.op === 'deleteUser')).toEqual([])
    expect(screen.getByRole('heading', { level: 1, name: 'Grace Hopper' })).toBeInTheDocument()
  })

  it('deletes on confirm and returns to the list page it came from, without the row', async () => {
    let deleted = false
    const pages: number[] = []
    const { user } = await openAt('/users?page=2', {
      listAdminUsers: async (_ref, _access, page) => {
        pages.push(page)
        const rows = deleted ? [] : [listRow]
        return { data: [overviewOf({ id: 3, email: 'edsger@example.com' }), ...rows], page, page_size: 10, total_page: 2, total_data: 11 }
      },
      getUserOverview: async () => grace,
      deleteUser: async (_ref, _access, id) => {
        deleted = id === 7
      },
    })

    await user.click(await screen.findByRole('link', { name: 'View Grace Hopper' }))
    await user.click(await screen.findByRole('button', { name: 'Delete' }))
    const dialog = await screen.findByRole('alertdialog', { name: 'Delete Grace Hopper?' })
    await user.click(within(dialog).getByRole('button', { name: 'Delete user' }))

    expect(await screen.findByRole('status')).toHaveTextContent('Deleted Grace Hopper (grace@example.com).')
    expect(await screen.findByText('edsger@example.com')).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'View Grace Hopper' })).not.toBeInTheDocument()
    expect(deleted).toBe(true)
    expect(pages).toEqual([2, 2])
  })

  it('steps back a page when it deletes the only row on the last page', async () => {
    let deleted = false
    const pages: number[] = []
    const firstPage = Array.from({ length: 10 }, (_, index) => overviewOf({ id: index + 1, email: `user${index + 1}@example.com` }))
    const lastRow = { ...listRow, id: 11 }
    const { user } = await openAt('/users?page=2', {
      listAdminUsers: async (_ref, _access, page) => {
        pages.push(page)
        const totals = deleted ? { total_page: 1, total_data: 10 } : { total_page: 2, total_data: 11 }
        const rows = page === 1 ? firstPage : deleted ? [] : [lastRow]
        return { data: rows, page, page_size: 10, ...totals }
      },
      getUserOverview: async () => ({ ...grace, id: 11 }),
      deleteUser: async () => {
        deleted = true
      },
    })

    await user.click(await screen.findByRole('link', { name: 'View Grace Hopper' }))
    await user.click(await screen.findByRole('button', { name: 'Delete' }))
    const dialog = await screen.findByRole('alertdialog', { name: 'Delete Grace Hopper?' })
    await user.click(within(dialog).getByRole('button', { name: 'Delete user' }))

    expect(await screen.findByRole('status')).toHaveTextContent('Deleted Grace Hopper (grace@example.com).')
    expect(await screen.findByText('Page 1 of 1 · 10 rows')).toBeInTheDocument()
    expect(screen.getByRole('status')).toHaveTextContent('Deleted Grace Hopper (grace@example.com).')
    expect(screen.getByRole('button', { name: 'Previous page' })).toBeDisabled()
    expect(pages).toEqual([2, 2, 1])
  })

  it('keeps the dialog open with the reason when the API refuses', async () => {
    const { user } = await openAt('/users/7', {
      getUserOverview: async () => grace,
      deleteUser: () => Promise.reject(new ApiError(409, 'admin-001', 'an admin cannot delete their own account')),
    })

    await user.click(await screen.findByRole('button', { name: 'Delete' }))
    const dialog = await screen.findByRole('alertdialog')
    await user.click(within(dialog).getByRole('button', { name: 'Delete user' }))

    const alert = await within(dialog).findByRole('alert')
    expect(within(alert).getByText("You can't delete your own account. Another admin can.")).toBeInTheDocument()
    expect(alert).toHaveTextContent('HTTP 409 · trace_id admin-001')
  })

  it('disables Delete on your own page and says why', async () => {
    await openAt(`/users/${ada.id}`, { getUserOverview: async () => ({ ...row, id: ada.id }) })

    const button = await screen.findByRole('button', { name: 'Delete' })
    expect(button).toBeDisabled()
    expect(button).toHaveAccessibleDescription("You can't delete your own account. Another admin can.")
  })
})

describe('revoking a session', () => {
  const signedIn = overviewOf(
    { ...row, email: 'grace@example.com', first_name: 'Grace', last_name: 'Hopper' },
    { session: { active: true, last_active_at: minutesAgo(5) } },
  )
  const signedOut = { ...signedIn, session: { active: false, last_active_at: signedIn.session.last_active_at } } as const

  it('asks first, naming the user, and Cancel sends nothing', async () => {
    const { user, calls } = await openAt('/users/7', { getUserOverview: async () => signedIn })

    await user.click(await screen.findByRole('button', { name: 'Revoke session' }))

    const dialog = await screen.findByRole('alertdialog', { name: 'Sign Grace Hopper out?' })
    expect(dialog).toHaveTextContent('Their next request will need a new sign-in.')
    await user.click(within(dialog).getByRole('button', { name: 'Cancel' }))
    await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument())
    expect(calls.filter((c) => c.op === 'revokeUserSession')).toEqual([])
  })

  it('signs the user out on confirm, says so, and reads the session again', async () => {
    let revoked: number | null = null
    const { user, calls } = await openAt('/users/7', {
      getUserOverview: async () => (revoked === null ? signedIn : signedOut),
      revokeUserSession: async (_ref, _access, id) => {
        revoked = id
      },
    })

    await user.click(await screen.findByRole('button', { name: 'Revoke session' }))
    const dialog = await screen.findByRole('alertdialog')
    await user.click(within(dialog).getByRole('button', { name: 'Sign out Grace Hopper' }))

    expect(await screen.findByRole('status')).toHaveTextContent('Signed Grace Hopper out. Their next request will need a new sign-in.')
    const card = screen.getByRole('region', { name: 'Grace Hopper' })
    await waitFor(() => expect(fields(card)).toMatchObject({ Session: 'Signed out' }))
    expect(screen.queryByRole('button', { name: 'Revoke session' })).not.toBeInTheDocument()
    await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument())
    expect(revoked).toBe(7)
    expect(calls.filter((c) => c.op === 'getUserOverview')).toHaveLength(2)
  })

  it('offers no revoke when the user is already signed out', async () => {
    await openAt('/users/7', { getUserOverview: async () => signedOut })

    await screen.findByRole('button', { name: 'Delete' })
    expect(screen.queryByRole('button', { name: 'Revoke session' })).not.toBeInTheDocument()
  })

  it('offers no revoke on your own page, where Sign out is in the sidebar', async () => {
    await openAt(`/users/${ada.id}`, { getUserOverview: async () => ({ ...signedIn, id: ada.id }) })

    await screen.findByRole('button', { name: 'Delete' })
    expect(screen.queryByRole('button', { name: 'Revoke session' })).not.toBeInTheDocument()
  })

  it.each([
    [409, 'admin-003', 'an admin cannot revoke their own session', "You can't revoke your own session. Use Sign out instead."],
    [404, 'users-005', 'user not found', 'This user no longer exists. Someone may have deleted it already.'],
    [409, 'admin-004', 'this demo account is protected', DEMO_LOCKED],
  ])('keeps the dialog open with the reason on %i %s', async (status, traceId, message, copy) => {
    const { user } = await openAt('/users/7', {
      getUserOverview: async () => signedIn,
      revokeUserSession: () => Promise.reject(new ApiError(status, traceId, message)),
    })

    await user.click(await screen.findByRole('button', { name: 'Revoke session' }))
    const dialog = await screen.findByRole('alertdialog')
    await user.click(within(dialog).getByRole('button', { name: 'Sign out Grace Hopper' }))

    const alert = await within(dialog).findByRole('alert')
    expect(within(alert).getByText(copy)).toBeInTheDocument()
    expect(alert).toHaveTextContent(`HTTP ${status} · trace_id ${traceId}`)
  })
})

describe('a protected demo account', () => {
  const demo = overviewOf(
    { ...row, email: 'member@demo.test', first_name: 'Grace', last_name: 'Hopper' },
    { protected: true, session: { active: true, last_active_at: minutesAgo(5) } },
  )

  it('turns off Edit, Delete and Revoke session and says why in one line', async () => {
    const { user, calls } = await openAt('/users/7', { getUserOverview: async () => demo })

    const card = await screen.findByRole('region', { name: 'Grace Hopper' })
    const actions = ['Edit', 'Delete', 'Revoke session'].map((name) => within(card).getByRole('button', { name }))
    for (const action of actions) {
      expect(action).toBeDisabled()
      expect(action).toHaveAccessibleDescription(DEMO_LOCKED)
    }
    expect(within(card).getAllByText(DEMO_LOCKED)).toHaveLength(1)
    expect(within(card).queryByRole('link', { name: 'Edit' })).not.toBeInTheDocument()

    for (const action of actions) await user.click(action)
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
    expect(calls.map((c) => c.op)).not.toContain('deleteUser')
    expect(calls.map((c) => c.op)).not.toContain('revokeUserSession')
  })

  it('keeps Edit, Delete and Revoke session on for an unprotected user', async () => {
    await openAt('/users/7', { getUserOverview: async () => ({ ...demo, protected: false }) })

    const card = await screen.findByRole('region', { name: 'Grace Hopper' })
    expect(within(card).getByRole('link', { name: 'Edit' })).toHaveAttribute('href', '/users/7/edit')
    expect(within(card).getByRole('button', { name: 'Delete' })).toBeEnabled()
    expect(within(card).getByRole('button', { name: 'Revoke session' })).toBeEnabled()
    expect(within(card).queryByText(DEMO_LOCKED)).not.toBeInTheDocument()
  })
})
