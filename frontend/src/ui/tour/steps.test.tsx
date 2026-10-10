import { cleanup, screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import type { AuthApi } from '../../application/ports'
import { ApiError } from '../../domain/errors'
import { ada, firstPair, overviewOf } from '../../test/fakes'
import { renderApp } from '../../test/renderApp'
import { ROLE_EVIDENCE, TOUR_STEPS } from './steps'

const usersPage: AuthApi['listAdminUsers'] = async () => ({
  data: [overviewOf(ada, { role: 'admin' })],
  page: 1,
  page_size: 10,
  total_page: 1,
  total_data: 1,
})

/** Every `data-tour` value on screen while the users page shows and the inspector is open. */
async function renderedTargets(listAdminUsers: AuthApi['listAdminUsers'], loaded: () => Promise<HTMLElement>) {
  localStorage.setItem('guided-tour-seen', '1')
  const { user, container } = await renderApp({ path: '/users', tokens: firstPair, api: { profile: async () => ada, listAdminUsers } })
  await screen.findByRole('heading', { level: 1, name: 'Users' })
  await loaded()
  await user.click(screen.getByRole('button', { name: 'Session inspector' }))
  await screen.findByRole('dialog', { name: 'Session inspector' })
  return new Set([...document.querySelectorAll('[data-tour]'), ...container.querySelectorAll('[data-tour]')].map((el) => el.getAttribute('data-tour')))
}

describe('the tour step table', () => {
  it('gives every step its own id and every target to one step', () => {
    const ids = TOUR_STEPS.map((step) => step.id)
    const targets = TOUR_STEPS.flatMap((step) => (step.target ? [step.target] : []))
    expect(new Set(ids).size).toBe(ids.length)
    expect(new Set(targets).size).toBe(targets.length)
  })

  it('points only at targets the app renders, for an admin and for a member', async () => {
    const admin = await renderedTargets(usersPage, () => screen.findByRole('table', { name: 'Users' }))
    cleanup()
    const member = await renderedTargets(() => Promise.reject(new ApiError(403, 'middleware-004', 'admin permission required')), () =>
      screen.findByRole('heading', { name: 'This account is not an admin' }),
    )

    const rendered = new Set([...admin, ...member])
    for (const step of TOUR_STEPS) {
      if (step.target) expect(rendered, `step ${step.id}`).toContain(step.target)
    }
    expect(admin).toContain(ROLE_EVIDENCE.admin)
    expect(admin).not.toContain(ROLE_EVIDENCE.member)
    expect(member).toContain(ROLE_EVIDENCE.member)
    expect(member).not.toContain(ROLE_EVIDENCE.admin)
  })

  it('frames New user together with the Users table on the users step, since its copy names both', async () => {
    localStorage.setItem('guided-tour-seen', '1')
    await renderApp({ path: '/users', tokens: firstPair, api: { profile: async () => ada, listAdminUsers: usersPage } })
    await screen.findByRole('table', { name: 'Users' })
    const users = TOUR_STEPS.find((step) => step.id === 'users')

    const framed = document.querySelector<HTMLElement>(`[data-tour="${users?.target}"]`)

    expect(framed).not.toBeNull()
    expect(within(framed as HTMLElement).getByRole('link', { name: 'New user' })).toBeInTheDocument()
    expect(within(framed as HTMLElement).getByRole('table', { name: 'Users' })).toBeInTheDocument()
  })
})
