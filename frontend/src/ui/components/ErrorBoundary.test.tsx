import { screen, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { ada, firstPair, overviewOf } from '../../test/fakes'
import { renderApp } from '../../test/renderApp'

const grace = overviewOf({ id: 9, email: 'grace@example.com', first_name: 'Grace', last_name: 'Hopper' })
const page = { data: [grace], page: 1, page_size: 10, total_page: 1, total_data: 1 }

describe('an unexpected failure', () => {
  it('replaces a page whose load threw something other than an ApiError with the recovery screen', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
    await renderApp({
      path: '/users',
      tokens: firstPair,
      api: { profile: async () => ada, listAdminUsers: () => Promise.reject(new TypeError('rows is not iterable')) },
    })

    const alert = await screen.findByRole('alert')
    expect(within(alert).getByRole('heading', { name: 'Something went wrong' })).toBeInTheDocument()
    expect(alert).toHaveTextContent('rows is not iterable')
    expect(within(alert).getByRole('button', { name: 'Reload the page' })).toBeInTheDocument()
    expect(screen.getByRole('navigation', { name: 'Main' })).toBeInTheDocument()
  })

  it('replaces the page when an action throws something other than an ApiError', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const { user } = await renderApp({
      path: '/users/9',
      tokens: firstPair,
      api: {
        profile: async () => ada,
        getUserOverview: async () => grace,
        listAdminUsers: async () => page,
        deleteUser: () => Promise.reject(new TypeError('cannot read properties of undefined')),
      },
    })

    await user.click(await screen.findByRole('button', { name: 'Delete' }))
    const dialog = await screen.findByRole('alertdialog', { name: 'Delete Grace Hopper?' })
    await user.click(within(dialog).getByRole('button', { name: 'Delete user' }))

    expect(await screen.findByRole('heading', { name: 'Something went wrong' })).toBeInTheDocument()
  })
})
