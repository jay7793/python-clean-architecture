import { screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ada, firstPair } from '../../test/fakes'
import { renderApp } from '../../test/renderApp'

describe('Page changes', () => {
  // jsdom cannot draw a transition, so the stub throws and React applies the update directly.
  const startViewTransition = vi.fn(() => {
    throw new Error('jsdom has no view transitions')
  })

  beforeEach(() => {
    Object.defineProperty(document, 'startViewTransition', { value: startViewTransition, configurable: true })
  })

  afterEach(() => {
    Reflect.deleteProperty(document, 'startViewTransition')
    startViewTransition.mockClear()
    vi.unstubAllGlobals()
  })

  const prefersReducedMotion = (reduce: boolean) =>
    vi.stubGlobal('matchMedia', (query: string) => ({
      matches: reduce && query === '(prefers-reduced-motion: reduce)',
      media: query,
      addEventListener: () => {},
      removeEventListener: () => {},
    }))

  const openDataFromProfile = async () => {
    const { user } = await renderApp({
      path: '/profile',
      tokens: firstPair,
      api: { profile: async () => ada, listAdminUsers: async () => ({ data: [], page: 1, page_size: 10, total_page: 0, total_data: 0 }) },
    })
    await user.click(await screen.findByRole('link', { name: 'Users' }))
    await screen.findByRole('heading', { name: 'Users' })
  }

  it('run through a view transition', async () => {
    prefersReducedMotion(false)

    await openDataFromProfile()

    expect(startViewTransition).toHaveBeenCalled()
  })

  it('skip the view transition when the visitor prefers reduced motion', async () => {
    prefersReducedMotion(true)

    await openDataFromProfile()

    expect(startViewTransition).not.toHaveBeenCalled()
  })
})
