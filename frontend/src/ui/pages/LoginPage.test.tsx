import { screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ApiError } from '../../domain/errors'
import { ada, firstPair } from '../../test/fakes'
import { COLD_START_TIMEOUT, renderApp } from '../../test/renderApp'

describe('LoginPage', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('shows an email example and gives no hint for the sign-in password', async () => {
    await renderApp({ path: '/login' })

    expect(screen.getByLabelText('Email')).toHaveAttribute('placeholder', 'you@company.com')
    expect(screen.getByLabelText('Password')).not.toHaveAttribute('placeholder')
  })

  it('names the recovery when the credentials are wrong and keeps the API message with its trace_id', async () => {
    const { user, fill, calls } = await renderApp({
      path: '/login',
      api: { login: () => Promise.reject(new ApiError(400, 'users-002', 'invalid email or password')) },
    })

    await fill('Email', ada.email)
    await fill('Password', 'wrong password')
    await user.click(screen.getByRole('button', { name: 'Sign in' }))

    const alert = await screen.findByRole('alert')
    expect(within(alert).getByText('Email or password is incorrect. Check both and try again.')).toBeInTheDocument()
    expect(alert).toHaveTextContent('HTTP 400 · trace_id users-002 · invalid email or password')
    expect(calls.map((c) => [c.op, c.arg])).toEqual([['login', { email: ada.email, password: 'wrong password' }]])
  })

  it('falls back to the API message for an error it has no copy for', async () => {
    const { user, fill } = await renderApp({
      path: '/login',
      api: { login: () => Promise.reject(new ApiError(0, 'network', 'Could not reach the API at http://localhost:3000.')) },
    })

    await fill('Email', ada.email)
    await fill('Password', 'correct horse')
    await user.click(screen.getByRole('button', { name: 'Sign in' }))

    const alert = await screen.findByRole('alert')
    expect(within(alert).getByText('Could not reach the API at http://localhost:3000.')).toBeInTheDocument()
    expect(alert).toHaveTextContent('trace_id network')
  })

  it('checks the fields before calling the API', async () => {
    const { user, fill, calls } = await renderApp({ path: '/login' })

    await fill('Email', 'not-an-email')
    await user.click(screen.getByRole('button', { name: 'Sign in' }))

    expect(await screen.findByText('Enter a valid email address.')).toBeInTheDocument()
    expect(screen.getByText('Enter your password.')).toBeInTheDocument()
    expect(calls).toEqual([])
  })

  it('says nothing about a field the visitor only clicked through', async () => {
    const { user } = await renderApp({ path: '/login' })
    const email = screen.getByLabelText('Email')

    await user.click(email)
    await user.tab()

    expect(email).not.toHaveAttribute('aria-invalid', 'true')
    expect(screen.queryByText('Enter a valid email address.')).not.toBeInTheDocument()
  })

  it('checks a typed value when the visitor leaves the field', async () => {
    const { user, fill } = await renderApp({ path: '/login' })

    await fill('Email', 'not-an-email')
    expect(screen.queryByText('Enter a valid email address.')).not.toBeInTheDocument()
    await user.tab()

    expect(await screen.findByText('Enter a valid email address.')).toBeInTheDocument()
    expect(screen.getByLabelText('Email')).toHaveAttribute('aria-invalid', 'true')
  })

  it('reports the empty fields when the visitor submits, then clears each error as it is fixed', async () => {
    const { user, calls } = await renderApp({ path: '/login' })

    await user.click(screen.getByRole('button', { name: 'Sign in' }))

    expect(await screen.findByText('Enter a valid email address.')).toBeInTheDocument()
    expect(screen.getByText('Enter your password.')).toBeInTheDocument()
    expect(calls).toEqual([])

    await user.type(screen.getByLabelText('Password'), 'x')
    expect(screen.queryByText('Enter your password.')).not.toBeInTheDocument()
  })

  it('marks a field valid once it is left with a valid value, and keeps an invalid one marked invalid', async () => {
    const { user, fill } = await renderApp({ path: '/login' })
    const email = screen.getByLabelText('Email')
    const password = screen.getByLabelText('Password')

    await fill('Email', 'not-an-email')
    await user.tab()
    expect(email).toHaveAttribute('aria-invalid', 'true')
    expect(email).not.toHaveAttribute('data-valid')

    await user.clear(email)
    await user.paste(ada.email)
    expect(email).toHaveAttribute('data-valid')
    expect(email).not.toHaveAttribute('aria-invalid', 'true')
    expect(password).not.toHaveAttribute('data-valid')

    await fill('Password', 'correct horse')
    await user.tab()
    expect(password).toHaveAttribute('data-valid')
  })

  it('opens the profile after signing in', async () => {
    const { user, fill } = await renderApp({
      path: '/login',
      api: { login: async () => ({ user: ada, token: firstPair }), profile: async () => ada },
    })

    await fill('Email', ada.email)
    await fill('Password', 'correct horse')
    await user.click(screen.getByRole('button', { name: 'Sign in' }))

    expect(await screen.findByRole('heading', { name: 'Ada Lovelace' }, { timeout: COLD_START_TIMEOUT })).toBeInTheDocument()
  })

  describe('demo accounts', () => {
    const panel = () => screen.getByRole('region', { name: 'Demo accounts' })

    it('lists the admin and the member with their public credentials', async () => {
      await renderApp({ path: '/login' })

      const rows = within(panel()).getAllByRole('listitem')
      expect(rows).toHaveLength(2)
      expect(rows[0]).toHaveTextContent('Admin')
      expect(rows[0]).toHaveTextContent('admin@demo.test')
      expect(rows[0]).toHaveTextContent('demo-admin-pass')
      expect(rows[1]).toHaveTextContent('Member')
      expect(rows[1]).toHaveTextContent('member@demo.test')
      expect(rows[1]).toHaveTextContent('demo-member-pass')
    })

    it('fills the form from a row and leaves the sign-in to the visitor', async () => {
      const { user, calls } = await renderApp({ path: '/login' })

      await user.click(within(panel()).getByRole('button', { name: 'Use the member account' }))

      expect(screen.getByLabelText('Email')).toHaveValue('member@demo.test')
      expect(screen.getByLabelText('Password')).toHaveValue('demo-member-pass')
      expect(screen.getByRole('button', { name: 'Sign in' })).toHaveFocus()
      expect(screen.queryByRole('alert')).not.toBeInTheDocument()
      expect(calls).toEqual([])
    })

    it('fills over what the visitor typed and clears the error it had', async () => {
      const { user, fill } = await renderApp({ path: '/login' })
      await fill('Email', 'not-an-email')
      await user.tab()
      expect(await screen.findByText('Enter a valid email address.')).toBeInTheDocument()

      await user.click(within(panel()).getByRole('button', { name: 'Use the admin account' }))

      expect(screen.getByLabelText('Email')).toHaveValue('admin@demo.test')
      expect(screen.queryByText('Enter a valid email address.')).not.toBeInTheDocument()
    })

    it('is hidden when VITE_SHOW_DEMO_ACCOUNTS is false', async () => {
      vi.stubEnv('VITE_SHOW_DEMO_ACCOUNTS', 'false')

      await renderApp({ path: '/login' })

      expect(screen.queryByRole('region', { name: 'Demo accounts' })).not.toBeInTheDocument()
      expect(screen.queryByText('admin@demo.test')).not.toBeInTheDocument()
    })
  })
})
