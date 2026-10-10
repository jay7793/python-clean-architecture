import { describe, expect, it, vi } from 'vitest'
import { ApiError, SessionEndedError } from '../domain/errors'
import { SESSION_ENDED_NOTICE } from '../domain/session'
import type { TokenPair, User, UserOverview } from '../domain/user'
import { ada, fakeApi, firstPair, memoryStore, overviewOf } from '../test/fakes'
import type { AuthApi, ExchangeRef } from './ports'
import { SessionController } from './session'

describe('SessionController sign-in', () => {
  it('starts anonymous without calling the API when no tokens are stored', async () => {
    const { api, calls } = fakeApi({})
    const session = new SessionController({ api, store: memoryStore() })

    await session.start()

    expect(session.getSession()).toEqual({ status: 'anonymous' })
    expect(calls).toEqual([])
  })

  it('restores a stored session by loading the profile with the stored access token', async () => {
    const { api, calls } = fakeApi({ profile: async () => ada })
    const session = new SessionController({ api, store: memoryStore(firstPair) })

    expect(session.getSession()).toEqual({ status: 'loading' })
    await session.start()

    expect(session.getSession()).toEqual({ status: 'authenticated', user: ada, tokens: firstPair })
    expect(calls.map((c) => [c.op, c.arg])).toEqual([['profile', 'access-1']])
  })

  it('logs in, stores the token pair and notifies subscribers', async () => {
    const store = memoryStore()
    const { api, calls } = fakeApi({ login: async () => ({ user: ada, token: firstPair }) })
    const session = new SessionController({ api, store })
    await session.start()
    const listener = vi.fn()
    session.subscribe(listener)

    await session.login({ email: ada.email, password: 'correct horse' })

    expect(session.getSession()).toEqual({ status: 'authenticated', user: ada, tokens: firstPair })
    expect(store.current).toEqual(firstPair)
    expect(listener).toHaveBeenCalled()
    expect(calls[0]?.ref.kind).toBe('request')
  })

  it('stays anonymous and surfaces the API error when credentials are wrong', async () => {
    const rejection = new ApiError(400, 'users-002', 'invalid email or password')
    const { api } = fakeApi({ login: () => Promise.reject(rejection) })
    const session = new SessionController({ api, store: memoryStore() })
    await session.start()

    await expect(session.login({ email: ada.email, password: 'nope' })).rejects.toBe(rejection)
    expect(session.getSession()).toEqual({ status: 'anonymous' })
  })

  it('registers without signing in', async () => {
    const { api } = fakeApi({ register: async () => ada })
    const session = new SessionController({ api, store: memoryStore() })
    await session.start()

    const created = await session.register({ email: ada.email, password: 'correct horse', first_name: 'Ada', last_name: 'Lovelace' })

    expect(created).toEqual(ada)
    expect(session.getSession()).toEqual({ status: 'anonymous' })
  })
})

const unauthorized = () => new ApiError(401, 'middleware-002', 'invalid or expired token')
const rotatedPair: TokenPair = { access: 'access-2', refresh: 'refresh-1-rotated' }
const usersPage = { data: [overviewOf(ada)], page: 1, page_size: 10, total_page: 1, total_data: 1 }

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason: unknown) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

const flush = () => new Promise((resolve) => setTimeout(resolve, 0))

async function signedIn(impl: Partial<AuthApi>) {
  const store = memoryStore()
  const fake = fakeApi({ login: async () => ({ user: ada, token: firstPair }), ...impl })
  const session = new SessionController({ api: fake.api, store })
  await session.start()
  await session.login({ email: ada.email, password: 'correct horse' })
  return { ...fake, store, session }
}

const rejectOldAccess =
  <T>(value: T) =>
  async (_ref: ExchangeRef, access: string): Promise<T> => {
    if (access === firstPair.access) throw unauthorized()
    return value
  }

describe('SessionController refresh', () => {
  it('shares one in-flight refresh between concurrent 401s and retries each call once under it', async () => {
    const refresh = deferred<{ user: User; token: TokenPair }>()
    const { session, calls, store } = await signedIn({
      profile: rejectOldAccess(ada),
      listAdminUsers: rejectOldAccess(usersPage),
      refresh: () => refresh.promise,
    })

    const results = Promise.all([session.profile(), session.listAdminUsers(1, 10)])
    results.catch(() => undefined)
    await flush()
    const refreshCalls = calls.filter((c) => c.op === 'refresh')
    expect(refreshCalls.map((c) => c.arg)).toEqual([firstPair.refresh])

    refresh.resolve({ user: ada, token: rotatedPair })
    expect(await results).toEqual([ada, usersPage])

    const [profile401, users401] = calls.filter((c) => c.ref.kind === 'request' && c.op !== 'login')
    const refreshRef = refreshCalls[0]?.ref
    expect(refreshRef).toMatchObject({ kind: 'refresh', parentId: profile401?.ref.id })
    expect(calls.filter((c) => c.ref.kind === 'retry').map((c) => [c.op, c.arg, c.ref.parentId, c.ref.repeats])).toEqual([
      ['profile', rotatedPair.access, refreshRef?.id, profile401?.ref.id],
      ['listAdminUsers', rotatedPair.access, refreshRef?.id, users401?.ref.id],
    ])
    expect(store.current).toEqual(rotatedPair)
    expect(session.getSession()).toEqual({ status: 'authenticated', user: ada, tokens: rotatedPair })
  })

  it('retries with the renewed access token when a 401 arrives after the refresh already settled', async () => {
    const profileAnswer = deferred<User>()
    const dataAnswer = deferred<typeof usersPage>()
    const valid = new Set([firstPair.refresh])
    const { session, calls } = await signedIn({
      profile: (_ref, access) => (access === firstPair.access ? profileAnswer.promise : Promise.resolve(ada)),
      listAdminUsers: (_ref, access) => (access === firstPair.access ? dataAnswer.promise : Promise.resolve(usersPage)),
      refresh: async (_ref, refreshToken) => {
        if (!valid.delete(refreshToken)) throw new ApiError(401, 'users-003', 'invalid refresh token')
        valid.add(rotatedPair.refresh)
        return { user: ada, token: rotatedPair }
      },
    })

    const profile = session.profile()
    const data = session.listAdminUsers(1, 10)
    data.catch(() => undefined)
    profileAnswer.reject(unauthorized())
    expect(await profile).toEqual(ada)
    dataAnswer.reject(unauthorized())

    expect(await data).toEqual(usersPage)
    expect(calls.filter((c) => c.op === 'refresh')).toHaveLength(1)
    expect(calls.filter((c) => c.op === 'listAdminUsers').map((c) => [c.ref.kind, c.arg])).toEqual([
      ['request', firstPair.access],
      ['retry', rotatedPair.access],
    ])
    expect(session.getSession()).toEqual({ status: 'authenticated', user: ada, tokens: rotatedPair })
  })

  it('retries only once when the retried call is rejected again', async () => {
    const { session, calls } = await signedIn({
      profile: () => Promise.reject(unauthorized()),
      refresh: async () => ({ user: ada, token: rotatedPair }),
    })

    await expect(session.profile()).rejects.toMatchObject({ status: 401 })
    expect(calls.filter((c) => c.op === 'profile').map((c) => c.ref.kind)).toEqual(['request', 'retry'])
    expect(calls.filter((c) => c.op === 'refresh')).toHaveLength(1)
  })
})

describe('SessionController admin users', () => {
  const grace = { ...ada, id: 9, email: 'grace@example.com', first_name: 'Grace', last_name: 'Hopper', is_admin: false, protected: false }
  const newAccount = { email: grace.email, password: 'pass', first_name: 'Grace', last_name: 'Hopper', is_admin: false }
  const graceOverview: UserOverview = { ...ada, id: 9, email: grace.email, first_name: 'Grace', last_name: 'Hopper', role: 'member', session: { active: false, last_active_at: null }, last_sign_in_at: null, protected: false }
  const overviewPage = { data: [graceOverview], page: 2, page_size: 10, total_page: 2, total_data: 11 }
  const signal = new AbortController().signal

  it.each([
    ['createUser', (session: SessionController) => session.createUser(newAccount), grace, [newAccount]],
    ['getAdminUser', (session: SessionController) => session.getAdminUser(9, signal), grace, [9, signal]],
    ['updateUser', (session: SessionController) => session.updateUser(9, { first_name: 'Amazing' }), grace, [9, { first_name: 'Amazing' }]],
    ['deleteUser', (session: SessionController) => session.deleteUser(9), undefined, [9]],
    ['listAdminUsers', (session: SessionController) => session.listAdminUsers(2, 10, signal), overviewPage, [2, 10, signal]],
    ['getUserOverview', (session: SessionController) => session.getUserOverview(9, signal), graceOverview, [9, signal]],
    ['revokeUserSession', (session: SessionController) => session.revokeUserSession(9), undefined, [9]],
  ] as const)('%s is an authenticated call, so a 401 refreshes and retries it', async (op, send, answer, args) => {
    const seen: unknown[][] = []
    const { session, calls } = await signedIn({
      [op]: async (ref: ExchangeRef, access: string, ...rest: unknown[]) => {
        seen.push([access, ...rest])
        return rejectOldAccess(answer)(ref, access)
      },
      refresh: async () => ({ user: ada, token: rotatedPair }),
    })

    await expect(send(session)).resolves.toEqual(answer)

    expect(calls.filter((c) => c.op !== 'login').map((c) => [c.op, c.ref.kind])).toEqual([
      [op, 'request'],
      ['refresh', 'refresh'],
      [op, 'retry'],
    ])
    expect(seen).toEqual([
      [firstPair.access, ...args],
      [rotatedPair.access, ...args],
    ])
  })
})

describe('SessionController when the refresh fails', () => {
  const refreshRejected = () => Promise.reject(new ApiError(401, 'users-003', 'invalid refresh token'))

  it('ends the session with a notice and rejects every waiting call', async () => {
    const { session, store, calls } = await signedIn({
      profile: rejectOldAccess(ada),
      listAdminUsers: rejectOldAccess(usersPage),
      refresh: refreshRejected,
    })

    const outcomes = await Promise.allSettled([session.profile(), session.listAdminUsers(1, 10)])

    expect(outcomes.map((o) => o.status === 'rejected' && o.reason instanceof SessionEndedError)).toEqual([true, true])
    expect(calls.filter((c) => c.op === 'refresh')).toHaveLength(1)
    expect(store.current).toBeNull()
    expect(session.getSession()).toEqual({ status: 'anonymous', notice: SESSION_ENDED_NOTICE })
  })

  it.each([
    ['gets no answer', new ApiError(0, 'network', 'Could not reach the API at http://localhost:3000. Is the backend running?')],
    ['answers 503', new ApiError(503, 'unknown', 'The API answered 503 without an error envelope.')],
  ])('keeps the session and surfaces the error when the refresh %s', async (_, failure) => {
    const { session, store } = await signedIn({ profile: rejectOldAccess(ada), refresh: () => Promise.reject(failure) })

    await expect(session.profile()).rejects.toBe(failure)

    expect(store.current).toEqual(firstPair)
    expect(session.getSession()).toEqual({ status: 'authenticated', user: ada, tokens: firstPair })
  })

  it('lands on anonymous with the notice when a stored session cannot be restored', async () => {
    const { api } = fakeApi({ profile: () => Promise.reject(unauthorized()), refresh: refreshRejected })
    const session = new SessionController({ api, store: memoryStore(firstPair) })

    await session.start()

    expect(session.getSession()).toEqual({ status: 'anonymous', notice: SESSION_ENDED_NOTICE })
  })
})

describe('SessionController across tabs', () => {
  const otherTabPair: TokenPair = { access: 'access-other-tab', refresh: 'refresh-other-tab' }

  it('adopts the pair another tab stored and retries instead of refreshing', async () => {
    const { session, store, calls } = await signedIn({ profile: rejectOldAccess(ada) })
    store.current = otherTabPair

    await expect(session.profile()).resolves.toEqual(ada)

    expect(calls.filter((c) => c.op !== 'login').map((c) => [c.op, c.ref.kind, c.arg])).toEqual([
      ['profile', 'request', firstPair.access],
      ['profile', 'retry', otherTabPair.access],
    ])
    expect(session.getSession()).toEqual({ status: 'authenticated', user: ada, tokens: otherTabPair })
  })

  it('adopts the pair another tab stored while this tab\'s refresh was rejected for using the old one', async () => {
    const { session, store } = await signedIn({
      profile: rejectOldAccess(ada),
      refresh: async () => {
        store.current = otherTabPair
        throw new ApiError(401, 'users-003', 'invalid refresh token')
      },
    })

    await expect(session.profile()).resolves.toEqual(ada)
    expect(session.getSession()).toEqual({ status: 'authenticated', user: ada, tokens: otherTabPair })
  })

  it('follows a pair another tab stores while signed in', async () => {
    const { session, store } = await signedIn({})

    store.fromOtherTab(otherTabPair)

    expect(session.getSession()).toEqual({ status: 'authenticated', user: ada, tokens: otherTabPair })
  })

  it('signs out when another tab signs out', async () => {
    const { session, store } = await signedIn({})

    store.fromOtherTab(null)

    expect(session.getSession()).toEqual({ status: 'anonymous' })
  })

  it('signs in when another tab signs in', async () => {
    const store = memoryStore()
    const { api } = fakeApi({ profile: async () => ada })
    const session = new SessionController({ api, store })
    await session.start()

    store.fromOtherTab(firstPair)
    await flush()

    expect(session.getSession()).toEqual({ status: 'authenticated', user: ada, tokens: firstPair })
  })
})

describe('SessionController logout', () => {
  it('revokes the refresh token, forgets the tokens and becomes anonymous', async () => {
    const { session, store, calls } = await signedIn({ logout: async () => undefined })

    await session.logout()

    expect(calls.filter((c) => c.op === 'logout').map((c) => c.arg)).toEqual([firstPair.refresh])
    expect(store.current).toBeNull()
    expect(session.getSession()).toEqual({ status: 'anonymous' })
  })

  it('still signs out locally when the server already ended the session', async () => {
    const { session, store } = await signedIn({
      logout: () => Promise.reject(new ApiError(401, 'users-004', 'session not found')),
    })

    await session.logout()

    expect(store.current).toBeNull()
    expect(session.getSession()).toEqual({ status: 'anonymous' })
  })
})

describe('SessionController demo and failure paths', () => {
  it('lands on anonymous with the error message when the API is unreachable at start', async () => {
    const offline = new ApiError(0, 'network', 'Could not reach the API at http://localhost:3000. Is the backend running?')
    const { api } = fakeApi({ profile: () => Promise.reject(offline) })
    const session = new SessionController({ api, store: memoryStore(firstPair) })

    await session.start()

    expect(session.getSession()).toEqual({ status: 'anonymous', notice: offline.message })
  })

  it('tampers with the in-memory access token so the next call is rejected and refreshed', async () => {
    const { session, calls } = await signedIn({
      profile: async (_ref, access) => {
        if (access !== rotatedPair.access) throw unauthorized()
        return ada
      },
      refresh: async () => ({ user: ada, token: rotatedPair }),
    })

    session.tamperAccessToken()
    const sentAccess = calls.length
    await session.profile()

    const profileCalls = calls.slice(sentAccess).filter((c) => c.op === 'profile')
    expect(profileCalls[0]?.arg).not.toBe(firstPair.access)
    expect(profileCalls.map((c) => c.ref.kind)).toEqual(['request', 'retry'])
  })
})

describe('SessionController audit log', () => {
  it('lists audit events as an authenticated call, so a 401 refreshes and retries it', async () => {
    const filters = { action: 'auth.login', actorEmail: 'ada' } as const
    const page = { data: [], page: 2, page_size: 25, total_page: 2, total_data: 30 }
    const signal = new AbortController().signal
    const seen: unknown[][] = []
    const { session, calls } = await signedIn({
      listAuditLogs: async (ref, access, ...rest) => {
        seen.push([access, ...rest])
        return rejectOldAccess(page)(ref, access)
      },
      refresh: async () => ({ user: ada, token: rotatedPair }),
    })

    await expect(session.listAuditLogs(filters, 2, 25, signal)).resolves.toEqual(page)

    expect(calls.filter((c) => c.op !== 'login').map((c) => [c.op, c.ref.kind])).toEqual([
      ['listAuditLogs', 'request'],
      ['refresh', 'refresh'],
      ['listAuditLogs', 'retry'],
    ])
    expect(seen).toEqual([
      [firstPair.access, filters, 2, 25, signal],
      [rotatedPair.access, filters, 2, 25, signal],
    ])
  })
})
