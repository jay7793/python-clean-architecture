import { screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { ApiError } from '../../domain/errors'
import { ada } from '../../test/fakes'
import { renderApp } from '../../test/renderApp'

async function fillIn({ user, fill }: Awaited<ReturnType<typeof renderApp>>) {
  await fill('First name', 'Ada')
  await fill('Last name', 'Lovelace')
  await fill('Email', ada.email)
  await fill('Password', 'correct horse')
  await user.click(screen.getByRole('button', { name: 'Create account' }))
}

describe('RegisterPage', () => {
  it('shows example values next to the labels and no password rule the API does not enforce', async () => {
    await renderApp({ path: '/register' })

    expect(screen.getByLabelText('First name')).toHaveAttribute('placeholder', 'Ada')
    expect(screen.getByLabelText('Last name')).toHaveAttribute('placeholder', 'Lovelace')
    expect(screen.getByLabelText('Email')).toHaveAttribute('placeholder', 'you@company.com')
    expect(screen.getByLabelText('Password')).not.toHaveAttribute('placeholder')
  })

  it('creates the account and sends the visitor to sign in with a confirmation', async () => {
    const app = await renderApp({ path: '/register', api: { register: async () => ada } })

    await fillIn(app)

    expect(await screen.findByRole('heading', { name: 'Sign in' })).toBeInTheDocument()
    expect(screen.getByRole('status')).toHaveTextContent(`Account created for ${ada.email}. Sign in to continue.`)
    expect(app.calls.map((c) => c.arg)).toEqual([
      { email: ada.email, password: 'correct horse', first_name: 'Ada', last_name: 'Lovelace' },
    ])
  })

  it('clears the confirmation once the visitor submits the sign-in form', async () => {
    const app = await renderApp({
      path: '/register',
      api: {
        register: async () => ada,
        login: () => Promise.reject(new ApiError(400, 'users-002', 'invalid email or password')),
      },
    })
    await fillIn(app)
    await screen.findByRole('heading', { name: 'Sign in' })

    await app.fill('Email', ada.email)
    await app.fill('Password', 'wrong password')
    await app.user.click(screen.getByRole('button', { name: 'Sign in' }))

    await screen.findByRole('alert')
    expect(screen.queryByText(/Account created/)).not.toBeInTheDocument()
  })

  it('shows the conflict from the API with its trace_id', async () => {
    const app = await renderApp({
      path: '/register',
      api: { register: () => Promise.reject(new ApiError(409, 'users-001', 'email already used')) },
    })

    await fillIn(app)

    const alert = await screen.findByRole('alert')
    expect(within(alert).getByText('This email already has an account. Use a different email.')).toBeInTheDocument()
    expect(alert).toHaveTextContent('HTTP 409 · trace_id users-001 · email already used')
  })
})
