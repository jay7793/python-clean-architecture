import { screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { ApiError } from '../../domain/errors'
import { firstPair } from '../../test/fakes'
import { renderApp } from '../../test/renderApp'

describe('protected routes', () => {
  it('send a visitor whose stored session cannot be refreshed to sign in, with the reason', async () => {
    await renderApp({
      path: '/profile',
      tokens: firstPair,
      api: {
        profile: () => Promise.reject(new ApiError(401, 'middleware-002', 'invalid or expired token')),
        refresh: () => Promise.reject(new ApiError(401, 'users-003', 'invalid refresh token')),
      },
    })

    expect(await screen.findByRole('heading', { name: 'Sign in' })).toBeInTheDocument()
    expect(screen.getByRole('status')).toHaveTextContent(
      'Your session ended. This account signed in somewhere else or the token expired.',
    )
  })
})
