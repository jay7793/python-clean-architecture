import { act, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ada, firstPair } from '../../test/fakes'
import { renderApp } from '../../test/renderApp'

const brand = () => screen.getByRole('link', { name: 'Clean Architecture · Python, home' })

describe('Brand', () => {
  afterEach(() => {
    delete (Element.prototype as Partial<Element>).animate
  })

  it('links to the profile from the sidebar when signed in', async () => {
    await renderApp({ path: '/profile', tokens: firstPair, api: { profile: async () => ada } })

    expect(brand()).toHaveAttribute('href', '/profile')
  })

  it('links to sign-in from the card when signed out', async () => {
    await renderApp({ path: '/register' })

    expect(brand()).toHaveAttribute('href', '/login')
  })

  it('pulses the sidebar mark when a new exchange lands', async () => {
    const animate = vi.fn(() => ({ reverse() {}, cancel() {} }) as unknown as Animation)
    Element.prototype.animate = animate
    const app = await renderApp({ path: '/profile', tokens: firstPair, api: { profile: async () => ada } })
    await screen.findByRole('heading', { name: 'Ada Lovelace' })
    const dot = brand().querySelector('circle')
    animate.mockClear()

    act(() => app.exchanges.open({ id: 'x1', kind: 'request', method: 'GET', path: '/api/v1/users/profile' }))

    expect(animate.mock.contexts).toContain(dot)
  })
})
