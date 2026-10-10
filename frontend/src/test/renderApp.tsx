import { StrictMode } from 'react'
import { act, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
import type { AuthApi } from '../application/ports'
import { ExchangeLog } from '../application/exchangeLog'
import { SessionController } from '../application/session'
import type { TokenClaims } from '../domain/token'
import type { TokenPair } from '../domain/user'
import { App } from '../ui/App'
import { fakeApi, memoryStore } from './fakes'

/** A cold first sign-in renders Profile, the tour and Users before the first assertion, which can exceed the default 1000ms under parallel load. */
export const COLD_START_TIMEOUT = 3000

/** The first test in a file also pays the warm-up of React, Base UI and user-event: its sign-in alone takes 2 to 3s under parallel load, so it gets more than vitest's default 5000ms. */
export const COLD_TEST_TIMEOUT = 10_000

type Options = { path?: string; api?: Partial<AuthApi>; tokens?: TokenPair | null }

export const claimsFor = (token: string): TokenClaims | null => ({
  sub: token.startsWith('refresh') ? 'refresh' : 'access',
  jti: `jti-of-${token}`,
  exp: 2_000_000_000,
})

export async function renderApp({ path = '/', api = {}, tokens = null }: Options = {}) {
  const fake = fakeApi(api)
  const store = memoryStore(tokens)
  const exchanges = new ExchangeLog({ now: () => Date.now() })
  const session = new SessionController({ api: fake.api, store })
  const user = userEvent.setup({ delay: null })
  const view = render(
    <StrictMode>
      <MemoryRouter initialEntries={[path]}>
        <App services={{ session, exchanges, decodeClaims: claimsFor }} />
      </MemoryRouter>
    </StrictMode>,
  )
  await act(() => session.start())
  async function fill(label: string, value: string) {
    await user.click(screen.getByLabelText(label))
    await user.paste(value)
  }
  return { ...view, ...fake, user, fill, session, store, exchanges }
}
