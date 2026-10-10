import { act, render, screen, within, type waitForOptions } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { AuthApi } from '../../application/ports'
import { ApiError } from '../../domain/errors'
import { ada, firstPair, overviewOf } from '../../test/fakes'
import { COLD_START_TIMEOUT, COLD_TEST_TIMEOUT, renderApp } from '../../test/renderApp'
import { useState } from 'react'
import { GuidedTour, type Panels } from './GuidedTour'
import { TakeTourButton } from './TakeTourButton'
import type { TourStep } from './steps'

const usersPage: AuthApi['listAdminUsers'] = async () => ({ data: [overviewOf(ada, { role: 'admin' })], page: 1, page_size: 10, total_page: 1, total_data: 1 })
const forbidden: AuthApi['listAdminUsers'] = () => Promise.reject(new ApiError(403, 'middleware-004', 'admin permission required'))

async function signsIn(listAdminUsers: AuthApi['listAdminUsers'] = usersPage) {
  const app = await renderApp({
    path: '/login',
    api: { login: async () => ({ user: ada, token: firstPair }), profile: async () => ada, listAdminUsers },
  })
  await app.fill('Email', ada.email)
  await app.fill('Password', 'correct horse')
  await app.user.click(screen.getByRole('button', { name: 'Sign in' }))
  return app
}

const restored = (path: string) => renderApp({ path, tokens: firstPair, api: { profile: async () => ada, listAdminUsers: usersPage } })

const closedPanels: Panels = {
  inspector: { open: false, onOpenChange: () => {} },
  'nav-drawer': { open: false, onOpenChange: () => {} },
}

const card = (name: string | RegExp, options?: waitForOptions) => screen.findByRole('dialog', { name }, options)
const tourCard = () => screen.queryByRole('dialog', { name: /./, description: /./ })
const takeTheTour = () => screen.getByRole('button', { name: 'Take the tour' })

/** A started tour leaves Profile for the users page, so it stayed shut if Profile is still there once the loads settle. */
async function expectNoTour() {
  await screen.findByRole('heading', { level: 1, name: 'Profile' })
  await act(() => new Promise((resolve) => setTimeout(resolve, 150)))
  expect(screen.getByRole('heading', { level: 1, name: 'Profile' })).toBeInTheDocument()
  expect(tourCard()).toBeNull()
}

afterEach(() => {
  vi.restoreAllMocks()
})

describe('Guided tour', () => {
  it('starts by itself after the first sign-in in this browser, on the users page', async () => {
    await signsIn()

    const first = await card('Pages come from one table', { timeout: COLD_START_TIMEOUT })
    expect(screen.getByRole('heading', { level: 1, name: 'Users' })).toBeInTheDocument()
    expect(within(first).getByText('1 of 7')).toBeInTheDocument()
    expect(within(first).getByRole('button', { name: 'Next' })).toHaveFocus()
  }, COLD_TEST_TIMEOUT)

  it('does not start by itself a second time', async () => {
    const first = await signsIn()
    await card('Pages come from one table', { timeout: COLD_START_TIMEOUT })
    first.unmount()

    await signsIn()

    await expectNoTour()
  })

  it('does not start by itself when a reload restores the session', async () => {
    await restored('/profile')

    await expectNoTour()
  })

  it('does not start by itself when storage is unavailable', async () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('storage disabled')
    })

    await signsIn()

    await expectNoTour()
  })

  it('walks an admin through every admin step, opening the inspector for the replay', async () => {
    const { user } = await signsIn()
    const next = async () => user.click(within(tourCard() as HTMLElement).getByRole('button', { name: /^(Next|Done)$/ }))

    await card('Pages come from one table', { timeout: COLD_START_TIMEOUT })
    await next()
    expect(within(await card('Rows are links')).getByText('2 of 7')).toBeInTheDocument()
    await next()
    await card('Every API call lands here')
    await next()
    await card('Replay a 401')
    expect(screen.getByRole('dialog', { name: 'Session inspector' })).toBeInTheDocument()
    await next()
    await card('Both tokens, decoded')
    await next()
    await card('Audit log')
    await expect.poll(() => screen.queryByRole('dialog', { name: 'Session inspector' })).toBeNull()
    await next()
    expect(within(await card('Read more in the README')).getByText('7 of 7')).toBeInTheDocument()
    await next()

    await expect.poll(tourCard).toBeNull()
    expect(takeTheTour()).toHaveFocus()
  })

  it('shows a member the 403 state and leaves out the admin steps', async () => {
    const { user } = await signsIn(forbidden)

    await card('Pages come from one table', { timeout: COLD_START_TIMEOUT })
    await user.click(screen.getByRole('button', { name: 'Next' }))

    const notAdmin = await card('This account is not an admin')
    expect(within(notAdmin).getByText('2 of 6')).toBeInTheDocument()
    expect(notAdmin).toHaveTextContent('The API answered 403 middleware-004.')
    await user.click(screen.getByRole('button', { name: 'Next' }))
    await card('Every API call lands here')
  })

  it('goes forward and back with the arrow keys', async () => {
    const { user } = await signsIn()
    await card('Pages come from one table', { timeout: COLD_START_TIMEOUT })

    await user.keyboard('{ArrowRight}')
    await card('Rows are links')
    await user.keyboard('{ArrowLeft}')

    expect(within(await card('Pages come from one table')).getByRole('button', { name: 'Next' })).toHaveFocus()
  })

  it('skips the tour on Escape and returns focus to Take the tour', async () => {
    const { user } = await signsIn()
    await card('Pages come from one table', { timeout: COLD_START_TIMEOUT })

    await user.keyboard('{Escape}')

    await expect.poll(tourCard).toBeNull()
    expect(takeTheTour()).toHaveFocus()
  })

  it('restarts from the header at any time', async () => {
    const { user } = await restored('/users')
    await screen.findByRole('table', { name: 'Users' })
    expect(tourCard()).toBeNull()

    await user.click(takeTheTour())

    expect(within(await card('Pages come from one table')).getByText('1 of 7')).toBeInTheDocument()
  })

  it('has focus on the card the moment it appears, so the first key press reaches it', async () => {
    const steps: TourStep[] = [{ id: 'here', target: 'nav', title: 'Here', body: 'On screen.', audience: 'all' }]
    const user = userEvent.setup({ delay: null })
    render(
      <MemoryRouter>
        <GuidedTour steps={steps} panels={closedPanels}>
          <nav data-tour="nav">Pages</nav>
          <TakeTourButton />
        </GuidedTour>
      </MemoryRouter>,
    )
    let focusedWhenShown: Element | null = null
    const observer = new MutationObserver(() => {
      if (!focusedWhenShown && tourCard()) focusedWhenShown = document.activeElement
    })
    observer.observe(document.body, { childList: true, subtree: true })

    await user.click(takeTheTour())
    await card('Here')
    observer.disconnect()

    expect(focusedWhenShown).toBe(screen.getByRole('button', { name: 'Done' }))
  })

  it('opens the panel a step reveals through its callback, and closes it when the tour moves on', async () => {
    const steps: TourStep[] = [
      { id: 'in-drawer', target: 'audit-log-link', title: 'In the drawer', body: 'Behind the menu.', audience: 'all', reveal: 'nav-drawer' },
      { id: 'end', target: null, title: 'End', body: 'The last step.', audience: 'all' },
    ]
    const drawerChanges: boolean[] = []
    function Page() {
      const [drawerOpen, setDrawerOpen] = useState(false)
      const panels: Panels = {
        ...closedPanels,
        'nav-drawer': {
          open: drawerOpen,
          onOpenChange: (open) => {
            drawerChanges.push(open)
            setDrawerOpen(open)
          },
        },
      }
      return (
        <GuidedTour steps={steps} panels={panels}>
          {drawerOpen && <a data-tour="audit-log-link">Audit log</a>}
          <TakeTourButton />
        </GuidedTour>
      )
    }
    const user = userEvent.setup({ delay: null })
    render(
      <MemoryRouter>
        <Page />
      </MemoryRouter>,
    )

    await user.click(takeTheTour())
    await card('In the drawer')
    expect(drawerChanges).toEqual([true])
    await user.click(screen.getByRole('button', { name: 'Next' }))

    await card('End')
    expect(drawerChanges).toEqual([true, false])
    expect(screen.queryByText('Audit log')).toBeNull()
  })

  it('skips a step whose target never appears', async () => {
    const steps: TourStep[] = [
      { id: 'here', target: 'nav', title: 'Here', body: 'On screen.', audience: 'all' },
      { id: 'gone', target: 'replay', title: 'Gone', body: 'Never rendered.', audience: 'all' },
      { id: 'end', target: null, title: 'End', body: 'The last step.', audience: 'all' },
    ]
    const user = userEvent.setup({ delay: null })
    render(
      <MemoryRouter>
        <GuidedTour steps={steps} timeoutMs={50} panels={closedPanels}>
          <nav data-tour="nav">Pages</nav>
          <TakeTourButton />
        </GuidedTour>
      </MemoryRouter>,
    )

    await user.click(takeTheTour())
    await card('Here')
    await user.click(screen.getByRole('button', { name: 'Next' }))

    expect(await card('End')).toBeInTheDocument()
    expect(screen.queryByRole('dialog', { name: 'Gone' })).toBeNull()
  })
})
