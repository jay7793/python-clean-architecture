import { screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import type { AuthApi } from '../../application/ports'
import { ada, firstPair, overviewOf } from '../../test/fakes'
import { renderApp } from '../../test/renderApp'

const onePage = <T,>(row: T) => ({ data: [row], page: 1, page_size: 10, total_page: 1, total_data: 1 })
const api: Partial<AuthApi> = {
  profile: async () => ada,
  listAdminUsers: async () => onePage(overviewOf(ada)),
}

const signedInAt = (path: string) => renderApp({ path, tokens: firstPair, api })

const sidebar = () => screen.getByRole('navigation', { name: 'Main' })

describe('Sidebar', () => {
  it('opens /users on the users table and marks Users, under Admin, as the current page', async () => {
    await signedInAt('/users')

    expect(await screen.findByRole('table', { name: 'Users' })).toBeInTheDocument()
    expect(within(sidebar()).getByRole('link', { name: 'Users' })).toHaveAttribute('aria-current', 'page')
    expect(within(sidebar()).getByRole('link', { name: 'Profile' })).not.toHaveAttribute('aria-current')
    expect(screen.getByRole('heading', { level: 1, name: 'Users' })).toBeInTheDocument()
    expect(screen.getByRole('navigation', { name: 'Breadcrumb' })).toHaveTextContent('Admin')
  })

  it('groups the pages as Account (Profile) and Admin (Users, Audit log)', async () => {
    await signedInAt('/profile')

    const group = (name: string) =>
      within(within(sidebar()).getByRole('list', { name }))
        .getAllByRole('link')
        .map((link) => [link.textContent, link.getAttribute('href')])
    expect(within(sidebar()).getAllByRole('list')).toHaveLength(2)
    expect(group('Account')).toEqual([['Profile', '/profile']])
    expect(group('Admin')).toEqual([
      ['Users', '/users'],
      ['Audit log', '/audit-log'],
    ])
  })

  it.each(['/data/users', '/admin/audit-log', '/nowhere'])('sends the unknown address %s to Profile', async (path) => {
    await signedInAt(path)

    expect(await screen.findByRole('heading', { level: 1, name: 'Profile' })).toBeInTheDocument()
  })

  it('titles Profile under Account', async () => {
    await signedInAt('/profile')

    expect(await screen.findByRole('heading', { level: 1, name: 'Profile' })).toBeInTheDocument()
    expect(screen.getByRole('navigation', { name: 'Breadcrumb' })).toHaveTextContent('Account')
  })

  it('tabs from the last page link straight to Sign out, past the placeholder rows', async () => {
    const { user } = await signedInAt('/profile')
    within(sidebar()).getByRole('link', { name: 'Profile' }).focus()

    await user.tab()
    expect(within(sidebar()).getByRole('link', { name: 'Users' })).toHaveFocus()
    await user.tab()
    expect(within(sidebar()).getByRole('link', { name: 'Audit log' })).toHaveFocus()
    await user.tab()
    expect(screen.getByRole('button', { name: 'Sign out' })).toHaveFocus()
  })

  it.each(['/profile', '/users'])('keeps the placeholders on %s hidden and out of reach', async (path) => {
    const { container } = await signedInAt(path)
    await screen.findByRole('heading', { level: 1 })

    const placeholders = [...container.querySelectorAll('[data-placeholder]')]
    expect(placeholders.length).toBeGreaterThan(0)
    for (const placeholder of placeholders) {
      expect(placeholder).toHaveAttribute('aria-hidden', 'true')
      expect(placeholder.querySelector('a, button, input, [tabindex]')).toBeNull()
      expect(placeholder).toHaveTextContent(/^$/)
    }
  })
})

describe('Navigation drawer', () => {
  it('opens from the header with focus inside, and Escape returns focus to the menu button', async () => {
    const { user } = await signedInAt('/profile')
    const menu = await screen.findByRole('button', { name: 'Open navigation' })

    await user.click(menu)

    const drawer = await screen.findByRole('dialog', { name: 'Navigation' })
    expect(within(drawer).getByRole('link', { name: 'Users' })).toBeInTheDocument()
    await expect.poll(() => drawer.contains(document.activeElement)).toBe(true)

    await user.keyboard('{Escape}')

    await expect.poll(() => screen.queryByRole('dialog', { name: 'Navigation' })).toBeNull()
    expect(menu).toHaveFocus()
  })

  it('closes once a page is chosen', async () => {
    const { user } = await signedInAt('/profile')

    await user.click(await screen.findByRole('button', { name: 'Open navigation' }))
    const drawer = await screen.findByRole('dialog', { name: 'Navigation' })
    await user.click(within(drawer).getByRole('link', { name: 'Users' }))

    expect(await screen.findByRole('heading', { level: 1, name: 'Users' })).toBeInTheDocument()
    await expect.poll(() => screen.queryByRole('dialog', { name: 'Navigation' })).toBeNull()
  })
})
