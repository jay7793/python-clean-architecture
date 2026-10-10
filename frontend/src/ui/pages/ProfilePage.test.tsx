import { screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { ada, firstPair } from '../../test/fakes'
import { renderApp } from '../../test/renderApp'

describe('ProfilePage', () => {
  it('shows the account the API returned', async () => {
    await renderApp({ path: '/profile', tokens: firstPair, api: { profile: async () => ada } })

    const details = await screen.findByRole('group', { name: 'Account' })
    expect(within(details).getByText(ada.email)).toBeInTheDocument()
    expect(within(details).getByText(String(ada.id))).toBeInTheDocument()
  })

  it('labels the account fields with the same words as the data table', async () => {
    await renderApp({ path: '/profile', tokens: firstPair, api: { profile: async () => ada } })

    const details = await screen.findByRole('group', { name: 'Account' })
    const terms = details.querySelectorAll('dt')
    expect([...terms].map((dt) => dt.textContent)).toEqual(['Email', 'First name', 'Last name', 'ID', 'Created', 'Updated'])
  })

  it('signs out from the sidebar, revoking the refresh token', async () => {
    const { user, calls } = await renderApp({
      path: '/profile',
      tokens: firstPair,
      api: { profile: async () => ada, logout: async () => undefined },
    })

    await user.click(await screen.findByRole('button', { name: 'Sign out' }))

    expect(await screen.findByRole('heading', { name: 'Sign in' })).toBeInTheDocument()
    expect(calls.filter((c) => c.op === 'logout').map((c) => c.arg)).toEqual([firstPair.refresh])
  })
})
