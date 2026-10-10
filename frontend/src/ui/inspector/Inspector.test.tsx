import { act, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { ExchangeLog } from '../../application/exchangeLog'
import type { ExchangeRef } from '../../application/ports'
import { ApiError } from '../../domain/errors'
import type { Exchange } from '../../domain/exchange'
import type { TokenClaims } from '../../domain/token'
import { ada, firstPair } from '../../test/fakes'
import { renderApp } from '../../test/renderApp'
import { RequestTimeline } from './RequestTimeline'
import { TokenStrip } from './TokenStrip'

const exchange = (id: string, startedAt: number, rest: Partial<Exchange> = {}): Exchange => ({
  id,
  startedAt,
  kind: 'request',
  method: 'GET',
  path: '/api/v1/users/profile',
  ...rest,
})

const usersPath = '/api/v1/admin/users?_page=1&_pageSize=10'

describe('RequestTimeline', () => {
  it('lists requests newest first, with short paths and what each status means', () => {
    render(
      <RequestTimeline
        exchanges={[
          exchange('login', 1, { method: 'POST', path: '/api/v1/users/login', status: 200 }),
          exchange('users', 2, { path: usersPath, status: 403, traceId: 'middleware-004' }),
        ]}
      />,
    )

    const [newest, oldest] = within(screen.getByRole('list', { name: 'Requests' })).getAllByRole('listitem').map((row) => within(row))
    expect(newest?.getByText('/admin/users')).toHaveTextContent('/admin/users?_page=1&_pageSize=10')
    expect(newest?.getByText('403 Admin only')).toBeInTheDocument()
    expect(newest?.getByText('middleware-004')).toBeInTheDocument()
    expect(newest?.getByText('middleware-004').closest('li')).toHaveAttribute('title', expect.stringContaining(`GET ${usersPath}`))
    expect(oldest?.getByText('/users/login')).toBeInTheDocument()
    expect(oldest?.getByText('200 OK')).toBeInTheDocument()
    expect(screen.queryByText(/\/api\/v1/)).not.toBeInTheDocument()
  })

  it('explains a known trace id in plain words', () => {
    render(<RequestTimeline exchanges={[exchange('login', 1, { method: 'POST', path: '/api/v1/users/login', status: 400, traceId: 'users-002' })]} />)

    const row = screen.getByRole('listitem')
    expect(within(row).getByText('400 Wrong credentials')).toBeInTheDocument()
    expect(row).toHaveAttribute('title', expect.stringContaining('Email or password is incorrect.'))
  })

  it('groups two 401s, their one shared refresh and both retries into one refresh episode', () => {
    render(
      <RequestTimeline
        exchanges={[
          exchange('a', 1, { status: 401, traceId: 'middleware-002' }),
          exchange('b', 2, { path: usersPath, status: 401, traceId: 'middleware-002' }),
          exchange('r', 3, { kind: 'refresh', parentId: 'a', method: 'POST', path: '/api/v1/users/refresh-token', status: 200 }),
          exchange('ra', 4, { kind: 'retry', parentId: 'r', repeats: 'a', status: 200 }),
          exchange('rb', 5, { kind: 'retry', parentId: 'r', repeats: 'b', path: usersPath }),
        ]}
      />,
    )

    const episode = screen.getByRole('list', { name: 'Refresh episode' })
    expect(within(episode).getAllByRole('listitem')).toHaveLength(5)
    expect(within(episode).getAllByText('401 Token rejected')).toHaveLength(2)
    expect(within(episode).getAllByText('/users/refresh-token')).toHaveLength(1)
    expect(within(episode).getByText('One refresh for 2 requests')).toBeInTheDocument()
    expect(within(episode).getAllByText('Retry')).toHaveLength(2)
    expect(within(episode).getByText('Waiting')).toBeInTheDocument()
  })

  it('shows the five newest entries and folds the rest behind a button', async () => {
    render(<RequestTimeline exchanges={Array.from({ length: 8 }, (_, i) => exchange(`x${i}`, i, { status: 200 }))} />)
    const list = screen.getByRole('list', { name: 'Requests' })
    expect(within(list).getAllByRole('listitem')).toHaveLength(5)

    fireEvent.click(screen.getByRole('button', { name: 'Show 3 earlier requests' }))

    expect(within(list).getAllByRole('listitem')).toHaveLength(8)
    expect(screen.queryByRole('button', { name: /earlier requests/ })).not.toBeInTheDocument()
  })

  it('says where requests will appear when there are none yet', () => {
    render(<RequestTimeline exchanges={[]} />)

    expect(screen.getByText('No requests yet. Each API call appears here as you use the app.')).toBeInTheDocument()
  })
})

describe('TokenStrip', () => {
  const exp = 2_000_000_000
  const access = '85e848cebad54cceb710d2931ba56b01'
  const refresh = 'ceaad4680569443fba6983ec69fb4fbb'

  it('says in plain words when each token expires, with the jti shortened', () => {
    const decode = (token: string): TokenClaims =>
      token === 'access-1' ? { sub: 'access', jti: access, exp, iat: exp - 3_600 } : { sub: 'refresh', jti: refresh, exp: exp + 86_400, iat: exp - 3_600 }

    render(<TokenStrip session={{ status: 'authenticated', user: ada, tokens: firstPair }} decode={decode} now={(exp - 900) * 1000} />)

    const accessRow = screen.getByRole('group', { name: 'Access token' })
    expect(accessRow).toHaveTextContent('Expires in 15m 0s')
    expect(within(accessRow).getByRole('meter', { name: 'Lifetime left' })).toHaveAttribute('aria-valuenow', '25')
    expect(within(accessRow).getByText('85e848ce')).toHaveAttribute('title', access)
    expect(accessRow).not.toHaveTextContent('sub')
    const refreshRow = screen.getByRole('group', { name: 'Refresh token' })
    expect(refreshRow).toHaveTextContent('Stays fixed when it rotates')
    expect(refreshRow.querySelector('time')).toHaveAttribute('dateTime', new Date((exp + 86_400) * 1000).toISOString())
    expect(within(refreshRow).getByText('ceaad468')).toHaveAttribute('title', refresh)
  })

  it('flags a rotation: the old jti is struck out, the refresh expiry it kept locks on, and the flag clears after', () => {
    const jtis: Record<string, string> = { 'access-1': 'a1a1a1a1-old', 'refresh-1': 'f1f1f1f1-old', 'access-2': 'a2a2a2a2-new', 'refresh-2': 'f2f2f2f2-new' }
    const decode = (token: string): TokenClaims => ({ sub: 'u1', jti: jtis[token] ?? '', exp: token === 'access-2' ? exp + 60 : exp })
    const signedIn = (tokens: typeof firstPair) => <TokenStrip session={{ status: 'authenticated', user: ada, tokens }} decode={decode} now={0} />
    const { rerender } = render(signedIn(firstPair))
    expect(screen.queryByText('Rotated')).not.toBeInTheDocument()

    rerender(signedIn({ access: 'access-2', refresh: 'refresh-2' }))

    const refreshRow = screen.getByRole('group', { name: 'Refresh token' })
    expect(within(refreshRow).getByText('Rotated')).toBeInTheDocument()
    expect(within(refreshRow).getByText('f2f2f2f2')).toBeInTheDocument()
    const outgoing = within(refreshRow).getByText('f1f1f1f1')
    expect(outgoing).toHaveAttribute('data-outgoing')
    expect(refreshRow.querySelector('time')).toHaveAttribute('data-lock-on')
    expect(screen.getByRole('group', { name: 'Access token' }).querySelector('time')).not.toHaveAttribute('data-lock-on')

    fireEvent.animationEnd(outgoing)
    expect(within(refreshRow).queryByText('Rotated')).not.toBeInTheDocument()
    expect(refreshRow.querySelector('[data-outgoing]')).toBeNull()
  })

  it('says there are no tokens before sign-in', () => {
    render(<TokenStrip session={{ status: 'anonymous' }} decode={() => null} now={0} />)

    expect(screen.getByText('No tokens yet. Sign in to see them here.')).toBeInTheDocument()
  })
})

describe('Inspector replay', () => {
  const rotated = { access: 'access-2', refresh: 'refresh-2' }
  const page = { data: [], page: 1, page_size: 10, total_page: 0, total_data: 0 }
  const valid = (access: string) => access === firstPair.access || access === rotated.access
  let log: ExchangeLog | undefined

  /** Records each call in the app's log the way the HTTP adapter does, so the inspector sees it. */
  const recorded =
    <T,>(method: string, path: string, answer: (access: string) => Promise<T>) =>
    async (ref: ExchangeRef, access: string): Promise<T> => {
      log?.open({ ...ref, method, path })
      try {
        const value = await answer(access)
        log?.close(ref.id, 200)
        return value
      } catch (error) {
        if (error instanceof ApiError) log?.close(ref.id, error.status, error.traceId)
        throw error
      }
    }
  const rejectBroken =
    <T,>(answer: () => Promise<T>) =>
    (access: string): Promise<T> =>
      valid(access) ? answer() : Promise.reject(new ApiError(401, 'middleware-002', 'invalid token'))

  async function replayAs(users: () => Promise<typeof page>) {
    const app = await renderApp({
      path: '/profile',
      tokens: firstPair,
      api: {
        profile: recorded('GET', '/api/v1/users/profile', rejectBroken(async () => ada)),
        listAdminUsers: recorded('GET', '/api/v1/admin/users?_page=1&_pageSize=10', rejectBroken(users)),
        refresh: recorded('POST', '/api/v1/users/refresh-token', async () => ({ user: ada, token: rotated })),
      },
    })
    log = app.exchanges
    await app.user.click(await screen.findByRole('button', { name: 'Session inspector' }))
    expect(within(screen.getByRole('list', { name: "What you'll see" })).getAllByRole('listitem').map((step) => step.textContent)).toEqual([
      expect.stringContaining('Profile and Users both get 401'),
      expect.stringContaining('One refresh is sent for both'),
      expect.stringContaining('Both retry with the new token'),
    ])
    await app.user.click(screen.getByRole('button', { name: 'Replay with a tampered access token' }))
    const result = await screen.findByRole('list', { name: 'Replay result' })
    return { ...app, steps: within(result).getAllByRole('listitem') }
  }

  it('checks off each step for a member, and explains the 403 on Users', async () => {
    const { steps, calls } = await replayAs(() => Promise.reject(new ApiError(403, 'middleware-004', 'admin permission required')))

    const [rejected, refreshed, retried] = steps
    expect(rejected).toHaveTextContent('Passed')
    expect(rejected).toHaveTextContent('2 × 401 middleware-002')
    expect(refreshed).toHaveTextContent('Passed')
    expect(refreshed).toHaveTextContent('1 × POST /users/refresh-token 200')
    expect(retried).toHaveTextContent('Passed')
    expect(retried).toHaveTextContent('2 retries: 200, 403')
    expect(retried).toHaveTextContent('The 403 is expected: the new token worked, and Users is admin-only.')
    expect(calls.filter((c) => c.op === 'refresh')).toHaveLength(1)
    expect(calls.filter((c) => c.op === 'listAdminUsers').map((c) => c.ref.kind)).toEqual(['request', 'retry'])
  })

  it('shows both retries answering 200 for an admin', async () => {
    const { steps } = await replayAs(async () => page)

    expect(steps.map((step) => step.textContent?.startsWith('Passed'))).toEqual([true, true, true])
    expect(steps[2]).toHaveTextContent('2 retries: 200, 200')
    expect(steps[2]).not.toHaveTextContent('403')
  })
})

describe('Floating inspector', () => {
  async function withOneExchange() {
    const app = await renderApp({ path: '/login' })
    act(() => {
      app.exchanges.open({ id: 'x1', kind: 'request', method: 'POST', path: '/api/v1/users/login' })
      app.exchanges.close('x1', 400, 'users-002')
    })
    return app
  }

  it('stays closed until the button opens it, then lists the requests so far', async () => {
    const { user } = await withOneExchange()

    const button = screen.getByRole('button', { name: 'Session inspector' })
    expect(button).toHaveTextContent('1')
    expect(screen.queryByRole('list', { name: 'Requests' })).not.toBeInTheDocument()

    await user.click(button)

    const panel = await screen.findByRole('dialog', { name: 'Session inspector' })
    expect(panel).toHaveTextContent('1 request')
    const list = within(panel).getByRole('list', { name: 'Requests' })
    expect(within(list).getByText('/users/login')).toBeInTheDocument()
    expect(within(list).getByText('users-002')).toBeInTheDocument()
  })

  it('clears the recorded requests on Clear log', async () => {
    const { user } = await withOneExchange()
    const button = screen.getByRole('button', { name: 'Session inspector' })
    await user.click(button)

    await user.click(await screen.findByRole('button', { name: 'Clear log' }))

    expect(screen.queryByRole('list', { name: 'Requests' })).not.toBeInTheDocument()
    expect(screen.getByText('No requests yet. Each API call appears here as you use the app.')).toBeInTheDocument()
    expect(button).not.toHaveTextContent('1')
  })

  it('names who is signed in', async () => {
    const { user } = await renderApp({ path: '/profile', tokens: firstPair, api: { profile: async () => ada } })

    await user.click(await screen.findByRole('button', { name: 'Session inspector' }))

    expect(await screen.findByRole('dialog', { name: 'Session inspector' })).toHaveTextContent('Ada Lovelace · ada@example.com')
  })

  it('announces the answer to the newest exchange', async () => {
    const app = await renderApp({ path: '/login' })
    const announcement = screen.getByRole('log', { name: 'Latest API answer' })

    act(() => app.exchanges.open({ id: 'x1', kind: 'request', method: 'POST', path: '/api/v1/users/login' }))
    expect(announcement).toBeEmptyDOMElement()

    act(() => app.exchanges.close('x1', 400, 'users-002'))
    expect(announcement).toHaveTextContent('POST /api/v1/users/login answered 400 users-002')
  })

  it('closes on Escape and returns focus to the button', async () => {
    const { user } = await withOneExchange()
    const button = screen.getByRole('button', { name: 'Session inspector' })

    await user.click(button)
    await screen.findByRole('dialog', { name: 'Session inspector' })
    await user.keyboard('{Escape}')

    await expect.poll(() => screen.queryByRole('dialog')).toBeNull()
    expect(button).toHaveFocus()
  })
})

describe('Inspector panel', () => {
  const viewport = (wide: boolean) =>
    vi.stubGlobal('matchMedia', (query: string) => ({
      matches: wide && query === '(min-width: 640px)',
      media: query,
      addEventListener: () => {},
      removeEventListener: () => {},
    }))

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  const openOnProfile = async () => {
    const app = await renderApp({
      path: '/profile',
      tokens: firstPair,
      api: { profile: async () => ada, listAdminUsers: async () => ({ data: [], page: 1, page_size: 10, total_page: 0, total_data: 0 }) },
    })
    await app.user.click(await screen.findByRole('button', { name: 'Session inspector' }))
    await screen.findByRole('dialog', { name: 'Session inspector' })
    return app
  }

  it('leaves the page usable beside it from 640px up', async () => {
    viewport(true)
    const { user } = await openOnProfile()

    await user.click(screen.getByRole('link', { name: 'Users' }))

    expect(await screen.findByRole('heading', { name: 'Users' })).toBeInTheDocument()
    expect(screen.getByRole('dialog', { name: 'Session inspector' })).toBeInTheDocument()
  })

  it('stays a modal drawer below 640px', async () => {
    viewport(false)
    await openOnProfile()

    expect(screen.queryByRole('link', { name: 'Users' })).not.toBeInTheDocument()
  })
})
