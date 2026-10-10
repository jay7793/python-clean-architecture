import { describe, expect, it, vi } from 'vitest'
import { ExchangeLog } from '../../application/exchangeLog'
import { ApiError } from '../../domain/errors'
import { NO_RESPONSE } from '../../domain/exchange'
import { createHttpAuthApi } from './authApi'

const user = {
  id: 1,
  email: 'ada@example.com',
  first_name: 'Ada',
  last_name: 'Lovelace',
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
}
const ref = { id: 'x1', kind: 'request' } as const

function respondWith(status: number, body: unknown) {
  return vi.fn<(request: Request) => Promise<Response>>(async () =>
    new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } }),
  )
}

function setup(fetch: (request: Request) => Promise<Response>) {
  const recorder = new ExchangeLog({ now: () => 7 })
  const api = createHttpAuthApi({ baseUrl: 'http://api.test', recorder, fetch: fetch as typeof globalThis.fetch })
  return { api, recorder }
}

const requestOf = (fetch: ReturnType<typeof respondWith>): Request => {
  const request = fetch.mock.calls[0]?.[0]
  if (!request) throw new Error('fetch was not called')
  return request
}

describe('createHttpAuthApi', () => {
  it('calls the page origin when the base URL is empty, as the single production image builds it', async () => {
    const fetch = respondWith(200, { user, token: { access: 'a', refresh: 'r' } })
    const recorder = new ExchangeLog({ now: () => 7 })
    const api = createHttpAuthApi({ baseUrl: '', recorder, fetch: fetch as typeof globalThis.fetch })

    await api.login(ref, { email: user.email, password: 'secret' })

    expect(requestOf(fetch).url).toBe(`${window.location.origin}/api/v1/users/login`)
    expect(recorder.list()[0]).toMatchObject({ path: '/api/v1/users/login', status: 200 })
  })

  it('posts credentials as JSON and records the exchange with its status', async () => {
    const fetch = respondWith(200, { user, token: { access: 'a', refresh: 'r' } })
    const { api, recorder } = setup(fetch)

    const result = await api.login(ref, { email: user.email, password: 'secret' })

    expect(result).toEqual({ user, token: { access: 'a', refresh: 'r' } })
    const request = requestOf(fetch)
    expect([request.method, request.url]).toEqual(['POST', 'http://api.test/api/v1/users/login'])
    expect(await request.json()).toEqual({ email: user.email, password: 'secret' })
    expect(recorder.list()).toEqual([
      { id: 'x1', kind: 'request', method: 'POST', path: '/api/v1/users/login', startedAt: 7, status: 200 },
    ])
  })

  it('turns the error envelope into an ApiError and records its trace_id', async () => {
    const { api, recorder } = setup(respondWith(400, { trace_id: 'users-002', message: 'invalid email or password' }))

    const failure = api.login(ref, { email: user.email, password: 'wrong' })

    await expect(failure).rejects.toEqual(new ApiError(400, 'users-002', 'invalid email or password'))
    await expect(failure).rejects.toMatchObject({ status: 400, traceId: 'users-002' })
    expect(recorder.list()[0]).toMatchObject({ status: 400, traceId: 'users-002' })
  })

  it('sends the access token as a bearer header for the profile', async () => {
    const fetch = respondWith(200, user)
    const { api } = setup(fetch)

    await expect(api.profile(ref, 'access-token')).resolves.toEqual(user)
    expect(requestOf(fetch).headers.get('Authorization')).toBe('Bearer access-token')
  })

  it('carries the 404 users-005 envelope for a missing user', async () => {
    const { api } = setup(respondWith(404, { trace_id: 'users-005', message: 'user not found' }))

    await expect(api.getAdminUser(ref, 'access-token', 99999)).rejects.toMatchObject({ status: 404, traceId: 'users-005' })
  })

  it('sends the refresh token in the body for refresh and logout', async () => {
    const fetch = respondWith(200, null)
    const { api } = setup(fetch)

    await api.logout(ref, 'refresh-token')

    expect(requestOf(fetch).url).toBe('http://api.test/api/v1/users/logout')
    expect(await requestOf(fetch).json()).toEqual({ refresh_token: 'refresh-token' })
  })

  it('creates a user with POST /admin/users, the bearer token and the JSON body', async () => {
    const created = { ...user, id: 9, is_admin: true }
    const fetch = respondWith(201, created)
    const { api, recorder } = setup(fetch)
    const input = { email: user.email, password: 'secret', first_name: 'Ada', last_name: 'Lovelace', is_admin: true }

    await expect(api.createUser(ref, 'access-token', input)).resolves.toEqual(created)
    const request = requestOf(fetch)
    expect([request.method, request.url]).toEqual(['POST', 'http://api.test/api/v1/admin/users'])
    expect(request.headers.get('Authorization')).toBe('Bearer access-token')
    expect(await request.json()).toEqual(input)
    expect(recorder.list()[0]).toMatchObject({ method: 'POST', path: '/api/v1/admin/users', status: 201 })
  })

  it('reads one user with its admin flag from GET /admin/users/{id}', async () => {
    const fetch = respondWith(200, { ...user, is_admin: false })
    const { api, recorder } = setup(fetch)

    await expect(api.getAdminUser(ref, 'access-token', 7)).resolves.toEqual({ ...user, is_admin: false })
    expect([requestOf(fetch).method, requestOf(fetch).url]).toEqual(['GET', 'http://api.test/api/v1/admin/users/7'])
    expect(requestOf(fetch).headers.get('Authorization')).toBe('Bearer access-token')
    expect(recorder.list()[0]).toMatchObject({ method: 'GET', path: '/api/v1/admin/users/7' })
  })

  it('sends only the changed fields with PATCH /admin/users/{id}', async () => {
    const fetch = respondWith(200, { ...user, first_name: 'Augusta', is_admin: false })
    const { api, recorder } = setup(fetch)

    await api.updateUser(ref, 'access-token', 7, { first_name: 'Augusta' })

    const request = requestOf(fetch)
    expect([request.method, request.url]).toEqual(['PATCH', 'http://api.test/api/v1/admin/users/7'])
    expect(request.headers.get('Authorization')).toBe('Bearer access-token')
    expect(await request.json()).toEqual({ first_name: 'Augusta' })
    expect(recorder.list()[0]).toMatchObject({ method: 'PATCH', path: '/api/v1/admin/users/7', status: 200 })
  })

  it('deletes a user with DELETE /admin/users/{id} and records the 204', async () => {
    const fetch = vi.fn<(request: Request) => Promise<Response>>(async () => new Response(null, { status: 204 }))
    const { api, recorder } = setup(fetch)

    await expect(api.deleteUser(ref, 'access-token', 7)).resolves.toBeUndefined()
    expect([requestOf(fetch).method, requestOf(fetch).url]).toEqual(['DELETE', 'http://api.test/api/v1/admin/users/7'])
    expect(requestOf(fetch).headers.get('Authorization')).toBe('Bearer access-token')
    expect(recorder.list()[0]).toMatchObject({ method: 'DELETE', path: '/api/v1/admin/users/7', status: 204 })
  })

  it('carries the 409 admin-001 envelope when an admin deletes themselves', async () => {
    const { api } = setup(respondWith(409, { trace_id: 'admin-001', message: 'an admin cannot delete their own account' }))

    await expect(api.deleteUser(ref, 'access-token', 1)).rejects.toMatchObject({ status: 409, traceId: 'admin-001' })
  })

  it('reports an unreachable API as an ApiError without a response', async () => {
    const { api, recorder } = setup(() => Promise.reject(new TypeError('Failed to fetch')))

    await expect(api.profile(ref, 'access-token')).rejects.toMatchObject({ status: NO_RESPONSE, traceId: 'network' })
    expect(recorder.list()[0]?.status).toBe(NO_RESPONSE)
  })
})

describe('createHttpAuthApi cancelled reads', () => {
  const fetchHonouringAbort = vi.fn<(request: Request) => Promise<Response>>(async (request) => {
    request.signal.throwIfAborted()
    return new Response(JSON.stringify(user), { status: 200, headers: { 'Content-Type': 'application/json' } })
  })

  it('drops a read cancelled before it was sent from the log and rejects with the abort reason', async () => {
    const { api, recorder } = setup(fetchHonouringAbort)
    const page = new AbortController()

    const read = api.profile(ref, 'access-token', page.signal)
    page.abort()

    await expect(read).rejects.toMatchObject({ name: 'AbortError' })
    expect(recorder.list()).toEqual([])
  })

  it('sends a read whose signal is never aborted', async () => {
    const { api, recorder } = setup(fetchHonouringAbort)

    await expect(api.profile(ref, 'access-token', new AbortController().signal)).resolves.toEqual(user)
    expect(recorder.list()).toMatchObject([{ id: 'x1', status: 200 }])
  })
})

describe('createHttpAuthApi audit log', () => {
  const event = {
    id: 3,
    occurred_at: '2026-10-10T09:00:00Z',
    action: 'auth.login_failed',
    outcome: 'failure',
    actor_user_id: null,
    actor_email: 'grace@example.com',
    target_user_id: null,
    target_email: null,
    trace_id: 'users-002',
    ip: '127.0.0.1',
    details: {},
  }
  const page = { data: [event], page: 2, page_size: 25, total_page: 2, total_data: 26 }

  it('sends the page and every filter as query parameters with the bearer token', async () => {
    const fetch = respondWith(200, page)
    const { api, recorder } = setup(fetch)
    const filters = { action: 'auth.login_failed', outcome: 'failure', actorEmail: 'grace@' } as const

    await expect(api.listAuditLogs(ref, 'access-token', filters, 2, 25)).resolves.toEqual(page)

    const path = '/api/v1/admin/audit-logs?_page=2&_pageSize=25&action=auth.login_failed&outcome=failure&actor_email=grace%40'
    expect([requestOf(fetch).method, requestOf(fetch).url]).toEqual(['GET', `http://api.test${path}`])
    expect(requestOf(fetch).headers.get('Authorization')).toBe('Bearer access-token')
    expect(recorder.list()[0]).toMatchObject({ method: 'GET', path, status: 200 })
  })

  it('leaves out the filters that are not set', async () => {
    const fetch = respondWith(200, { ...page, data: [] })
    const { api } = setup(fetch)

    await api.listAuditLogs(ref, 'access-token', { actorEmail: '' }, 1, 25)

    expect(requestOf(fetch).url).toBe('http://api.test/api/v1/admin/audit-logs?_page=1&_pageSize=25')
  })

  it('carries the 403 middleware-004 envelope for a member', async () => {
    const { api } = setup(respondWith(403, { trace_id: 'middleware-004', message: 'admin permission required' }))

    await expect(api.listAuditLogs(ref, 'access-token', {}, 1, 25)).rejects.toMatchObject({ status: 403, traceId: 'middleware-004' })
  })
})

describe('createHttpAuthApi admin user overview', () => {
  const overview = {
    ...user,
    id: 2,
    role: 'member',
    session: { active: true, last_active_at: '2026-10-10T09:00:00Z' },
    last_sign_in_at: '2026-10-10T08:55:00Z',
  }

  it('pages the overview with GET /admin/users, _page and _pageSize and the bearer token', async () => {
    const page = { data: [overview], page: 2, page_size: 10, total_page: 2, total_data: 11 }
    const fetch = respondWith(200, page)
    const { api, recorder } = setup(fetch)

    await expect(api.listAdminUsers(ref, 'access-token', 2, 10)).resolves.toEqual(page)

    const path = '/api/v1/admin/users?_page=2&_pageSize=10'
    expect([requestOf(fetch).method, requestOf(fetch).url]).toEqual(['GET', `http://api.test${path}`])
    expect(requestOf(fetch).headers.get('Authorization')).toBe('Bearer access-token')
    expect(recorder.list()[0]).toMatchObject({ method: 'GET', path, status: 200 })
  })

  it('reads one overview from GET /admin/users/{id}/overview', async () => {
    const fetch = respondWith(200, overview)
    const { api, recorder } = setup(fetch)

    await expect(api.getUserOverview(ref, 'access-token', 2)).resolves.toEqual(overview)

    expect([requestOf(fetch).method, requestOf(fetch).url]).toEqual(['GET', 'http://api.test/api/v1/admin/users/2/overview'])
    expect(requestOf(fetch).headers.get('Authorization')).toBe('Bearer access-token')
    expect(recorder.list()[0]).toMatchObject({ method: 'GET', path: '/api/v1/admin/users/2/overview', status: 200 })
  })

  it('reads an active session without a last_active_at as signed out', async () => {
    const { api } = setup(respondWith(200, { ...overview, session: { active: true, last_active_at: null } }))

    const read = await api.getUserOverview(ref, 'access-token', 2)

    expect(read.session).toEqual({ active: false, last_active_at: null })
  })

  it('revokes with DELETE /admin/users/{id}/session and records the 204', async () => {
    const fetch = vi.fn<(request: Request) => Promise<Response>>(async () => new Response(null, { status: 204 }))
    const { api, recorder } = setup(fetch)

    await expect(api.revokeUserSession(ref, 'access-token', 2)).resolves.toBeUndefined()

    expect([requestOf(fetch).method, requestOf(fetch).url]).toEqual(['DELETE', 'http://api.test/api/v1/admin/users/2/session'])
    expect(requestOf(fetch).headers.get('Authorization')).toBe('Bearer access-token')
    expect(recorder.list()[0]).toMatchObject({ method: 'DELETE', path: '/api/v1/admin/users/2/session', status: 204 })
  })

  it('carries the 409 admin-003 envelope when an admin revokes their own session', async () => {
    const { api } = setup(respondWith(409, { trace_id: 'admin-003', message: 'an admin cannot revoke their own session' }))

    await expect(api.revokeUserSession(ref, 'access-token', 1)).rejects.toMatchObject({ status: 409, traceId: 'admin-003' })
  })
})
