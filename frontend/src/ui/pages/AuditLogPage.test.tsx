import { screen, waitFor, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import type { AuditEvent, AuditFilters } from '../../domain/audit'
import { ApiError } from '../../domain/errors'
import type { Page } from '../../domain/user'
import { ada, firstPair } from '../../test/fakes'
import { renderApp } from '../../test/renderApp'

const fiveMinutesAgo = new Date(Date.now() - 5 * 60_000).toISOString()

const event = (id: number, fields: Partial<AuditEvent>): AuditEvent => ({
  id,
  occurred_at: fiveMinutesAgo,
  action: 'auth.login',
  outcome: 'success',
  actor_user_id: 1,
  actor_email: ada.email,
  target_user_id: null,
  target_email: null,
  trace_id: null,
  ip: '127.0.0.1',
  details: {},
  ...fields,
})

const updated = event(3, {
  action: 'admin.user_updated',
  target_user_id: 2,
  target_email: 'grace@example.com',
  details: { changed: 'password, last_name' },
})
const failed = event(2, {
  action: 'auth.login_failed',
  outcome: 'failure',
  actor_user_id: null,
  actor_email: 'grace@example.com',
  trace_id: 'users-002',
})
const granted = event(1, {
  action: 'admin.permission_granted',
  actor_user_id: null,
  actor_email: null,
  target_user_id: 1,
  target_email: ada.email,
  ip: null,
  details: { permission: 'admin' },
})

type Query = { filters: AuditFilters; page: number }

function openLog(answer: (query: Query) => Page<AuditEvent> | Promise<Page<AuditEvent>>, path = '/audit-log') {
  const queries: Query[] = []
  const view = renderApp({
    path,
    tokens: firstPair,
    api: {
      profile: async () => ada,
      listAuditLogs: async (_ref, _access, filters, page) => {
        queries.push({ filters, page })
        return answer({ filters, page })
      },
    },
  })
  return { view, queries }
}

const pageOf = (data: AuditEvent[], page = 1, totalPage = 1): Page<AuditEvent> => ({
  data,
  page,
  page_size: 20,
  total_page: totalPage,
  total_data: data.length,
})

const table = () => screen.findByRole('table', { name: 'Audit log' })

describe('AuditLogPage', () => {
  it('sits under Admin in the sidebar, after Users', async () => {
    const { view } = openLog(() => pageOf([]))
    const { user } = await view
    const sidebar = screen.getByRole('navigation', { name: 'Main' })

    expect(within(sidebar).getByRole('link', { name: 'Audit log' })).toHaveAttribute('aria-current', 'page')
    expect(screen.getByRole('navigation', { name: 'Breadcrumb' })).toHaveTextContent('Admin')
    within(sidebar).getByRole('link', { name: 'Users' }).focus()
    await user.tab()
    expect(within(sidebar).getByRole('link', { name: 'Audit log' })).toHaveFocus()
  })

  it('shows each event with a human action label right after its time, its outcome and its trace_id', async () => {
    openLog(() => pageOf([updated, failed, granted]))

    const log = await table()
    expect(within(log).getAllByRole('columnheader').map((th) => th.textContent)).toEqual(['Details', 'Time', 'Action', 'Actor', 'Target', 'Outcome', 'Trace ID'])
    const rows = within(log).getAllByRole('row').filter((row) => row.querySelector('time'))
    expect(rows.map((row) => within(row).getAllByRole('cell').map((cell) => cell.textContent))).toEqual([
      ['', '5 minutes ago', 'User edited', ada.email, 'grace@example.com', 'Success', '—'],
      ['', '5 minutes ago', 'Sign-in failed', 'grace@example.com', '—', 'Failure', 'users-002'],
      ['', '5 minutes ago', 'Permission granted', 'CLI', ada.email, 'Success', '—'],
    ])
    expect(within(rows[1] as HTMLElement).getByText('users-002').tagName).toBe('CODE')
    const time = rows[0]?.querySelector('time')
    expect(time).toHaveAttribute('dateTime', updated.occurred_at)
    expect(time?.getAttribute('title')).toMatch(/^[A-Z][a-z]{2} \d{1,2}, \d{4}, \d{1,2}:\d{2}:\d{2}/)
  })

  it('names a revoked session and filters by it', async () => {
    const revoked = event(4, { action: 'admin.session_revoked', target_user_id: 2, target_email: 'grace@example.com' })
    const { view, queries } = openLog(() => pageOf([revoked]))
    const { user } = await view

    const row = within(await table()).getAllByRole('row').find((tr) => tr.querySelector('time'))
    expect(within(row as HTMLElement).getByText('Session revoked')).toBeInTheDocument()

    await user.click(screen.getByRole('combobox', { name: 'Action' }))
    await user.click(await screen.findByRole('option', { name: 'Session revoked' }))
    await waitFor(() => expect(queries.at(-1)).toEqual({ filters: { action: 'admin.session_revoked' }, page: 1 }))
  })

  it('expands a row to show its details as a definition list', async () => {
    const { view } = openLog(() => pageOf([updated]))
    const { user } = await view
    await table()

    const toggle = screen.getByRole('button', { name: 'Details of event 3' })
    expect(toggle).toHaveAttribute('aria-expanded', 'false')
    await user.click(toggle)

    expect(toggle).toHaveAttribute('aria-expanded', 'true')
    const details = await screen.findByRole('region', { name: 'Details of event 3' })
    const terms = within(details).getAllByRole('term').map((term) => term.textContent)
    const values = within(details).getAllByRole('definition').map((value) => value.textContent)
    expect(Object.fromEntries(terms.map((term, i) => [term, values[i]]))).toMatchObject({
      'Changed fields': 'password, last_name',
      IP: '127.0.0.1',
      'Actor ID': '1',
      'Target ID': '2',
    })
  })

  it('builds the query from the action filter', async () => {
    const { view, queries } = openLog(() => pageOf([failed]))
    const { user } = await view
    await table()
    expect(queries.at(-1)).toEqual({ filters: {}, page: 1 })

    await user.click(screen.getByRole('combobox', { name: 'Action' }))
    await user.click(await screen.findByRole('option', { name: 'Sign-in failed' }))

    await waitFor(() => expect(queries.at(-1)).toEqual({ filters: { action: 'auth.login_failed' }, page: 1 }))
  })

  it('adds the outcome filter to the action already chosen', async () => {
    const { view, queries } = openLog(() => pageOf([failed]), '/audit-log?action=auth.login_failed')
    const { user } = await view
    await table()

    await user.click(screen.getByRole('combobox', { name: 'Outcome' }))
    await user.click(await screen.findByRole('option', { name: 'Failure' }))

    await waitFor(() =>
      expect(queries.at(-1)).toEqual({ filters: { action: 'auth.login_failed', outcome: 'failure' }, page: 1 }),
    )
  })

  it('adds the actor email to the chosen filters in one request once typing stops', async () => {
    const { view, queries } = openLog(() => pageOf([failed]), '/audit-log?action=auth.login_failed&outcome=failure')
    const { user } = await view
    await table()
    const sent = queries.length

    await user.type(screen.getByRole('textbox', { name: 'Actor email' }), 'grace')

    await waitFor(() =>
      expect(queries.at(-1)).toEqual({
        filters: { action: 'auth.login_failed', outcome: 'failure', actorEmail: 'grace' },
        page: 1,
      }),
    )
    expect(queries.length).toBe(sent + 1)
  })

  it('pages like the Users table', async () => {
    const { view, queries } = openLog(({ page }) => pageOf([event(10 - page, {})], page, 2))
    const { user } = await view
    await table()
    expect(screen.getByText('Page 1 of 2 · 1 event')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Next page' }))

    expect(await screen.findByText('Page 2 of 2 · 1 event')).toBeInTheDocument()
    expect(queries.map((q) => q.page)).toEqual([1, 2])
  })

  it('refreshes on demand and marks the events that arrived since', async () => {
    let latest = [failed, granted]
    const { view } = openLog(() => pageOf(latest))
    const { user } = await view
    await table()
    latest = [updated, failed, granted]

    await user.click(screen.getByRole('button', { name: 'Refresh' }))

    const fresh = await screen.findByText('User edited')
    expect(fresh.closest('tr')).toHaveAttribute('data-fresh')
    expect(screen.getByText('Sign-in failed').closest('tr')).not.toHaveAttribute('data-fresh')
  })

  it('tells an empty log from filters that match nothing', async () => {
    openLog(() => pageOf([]))
    expect(await screen.findByRole('heading', { name: 'No events yet' })).toBeInTheDocument()
  })

  it('reads the filters from the address, so a reload keeps them', async () => {
    const { queries } = openLog(() => pageOf([]), '/audit-log?outcome=failure&actor=grace&page=2')

    expect(await screen.findByRole('heading', { name: 'No events match these filters' })).toBeInTheDocument()
    expect(queries).toEqual([{ filters: { outcome: 'failure', actorEmail: 'grace' }, page: 2 }])
    expect(screen.getByRole('textbox', { name: 'Actor email' })).toHaveValue('grace')
  })

  it('shows the admin instructions on 403 middleware-004', async () => {
    openLog(() => Promise.reject(new ApiError(403, 'middleware-004', 'admin permission required')))

    expect(await screen.findByRole('heading', { name: 'This account is not an admin' })).toBeInTheDocument()
    expect(screen.getByText('middleware-004')).toBeInTheDocument()
  })

  it('draws shimmering rows while the log loads', async () => {
    openLog(() => new Promise(() => undefined))

    expect(await screen.findByLabelText('Loading events')).toHaveAttribute('aria-busy', 'true')
  })
})
