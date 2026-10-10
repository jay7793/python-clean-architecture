import { screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import type { AuthApi } from '../../application/ports'
import { ApiError } from '../../domain/errors'
import type { AccountChanges, AdminUser } from '../../domain/user'
import { ada, firstPair, overviewOf } from '../../test/fakes'
import { renderApp } from '../../test/renderApp'

const grace: AdminUser = {
  ...ada,
  id: 7,
  email: 'grace@example.com',
  first_name: 'Grace',
  last_name: 'Hopper',
  is_admin: false,
  protected: false,
}

/** A tiny in-memory API: the edit page reads Grace, the detail page reads whatever the last update saved. */
function graceApi(start: AdminUser = grace) {
  let current = start
  const sent: AccountChanges[] = []
  const api: Partial<AuthApi> = {
    profile: async () => ada,
    getAdminUser: async () => current,
    getUserOverview: async () => overviewOf(current, { role: current.is_admin ? 'admin' : 'member' }),
    updateUser: async (_ref, _access, _id, changes) => {
      sent.push(changes)
      current = { ...current, ...changes }
      return current
    },
  }
  return { api, sent }
}

describe('EditUserPage', () => {
  it('opens from the Edit link on the detail page, prefilled with the password left empty', async () => {
    const { api } = graceApi({ ...grace, is_admin: true })
    const { user } = await renderApp({ path: '/users/7', tokens: firstPair, api })

    await user.click(await screen.findByRole('link', { name: 'Edit' }))

    expect(await screen.findByRole('heading', { level: 1, name: 'Edit Grace Hopper' })).toBeInTheDocument()
    expect(screen.getByLabelText('First name')).toHaveValue('Grace')
    expect(screen.getByLabelText('Last name')).toHaveValue('Hopper')
    expect(screen.getByLabelText('Email')).toHaveValue(grace.email)
    expect(screen.getByLabelText('Password')).toHaveValue('')
    expect(screen.getByText('Leave empty to keep the current password. A new password signs this user out.')).toBeInTheDocument()
    expect(screen.getByRole('switch', { name: 'Administrator' })).toBeChecked()
  })

  it('sends only what changed, keeps the password, and returns to the updated user', async () => {
    const { api, sent } = graceApi()
    const app = await renderApp({ path: '/users/7/edit', tokens: firstPair, api })
    await screen.findByDisplayValue('Grace')

    await app.user.clear(screen.getByLabelText('First name'))
    await app.fill('First name', 'Amazing')
    await app.user.click(screen.getByRole('switch', { name: 'Administrator' }))
    await app.user.click(screen.getByRole('button', { name: 'Save changes' }))

    expect(await screen.findByRole('heading', { level: 1, name: 'Amazing Hopper' })).toBeInTheDocument()
    expect(screen.getByRole('status')).toHaveTextContent('Saved Amazing Hopper.')
    expect(sent).toEqual([{ first_name: 'Amazing', is_admin: true }])
  })

  it('sends a new password and says it ended their session', async () => {
    const { api, sent } = graceApi()
    const app = await renderApp({ path: '/users/7/edit', tokens: firstPair, api })
    await screen.findByDisplayValue('Grace')

    await app.fill('Password', 'new-pass')
    await app.user.click(screen.getByRole('button', { name: 'Save changes' }))

    expect(await screen.findByRole('status')).toHaveTextContent(
      'Saved Grace Hopper. Their session ended, so they sign in again with the new details.',
    )
    expect(sent).toEqual([{ password: 'new-pass' }])
  })

  it('warns that a new password signs you out when you edit yourself', async () => {
    const { api } = graceApi({ ...ada, is_admin: true, protected: false })
    await renderApp({ path: `/users/${ada.id}/edit`, tokens: firstPair, api })

    expect(await screen.findByText('Leave empty to keep your current password. A new password signs you out here too.')).toBeInTheDocument()
  })

  it('locks the Administrator switch when you edit yourself', async () => {
    const { api } = graceApi({ ...ada, is_admin: true, protected: false })
    await renderApp({ path: `/users/${ada.id}/edit`, tokens: firstPair, api })

    const toggle = await screen.findByRole('switch', { name: 'Administrator' })
    expect(toggle).toBeChecked()
    expect(toggle).toHaveAttribute('data-disabled')
    expect(screen.getByText("You can't remove your own admin access. Another admin can.")).toBeInTheDocument()
  })

  it('says the user was not found on 404 users-005', async () => {
    await renderApp({
      path: '/users/99/edit',
      tokens: firstPair,
      api: { profile: async () => ada, getAdminUser: () => Promise.reject(new ApiError(404, 'users-005', 'user not found')) },
    })

    expect(await screen.findByRole('heading', { name: 'User not found' })).toBeInTheDocument()
    expect(screen.getByText('users-005')).toBeInTheDocument()
  })
})
