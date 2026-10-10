import { describe, expect, it } from 'vitest'
import { TOUR_STEPS, type TourStep } from './steps'
import { createTourReducer, progress, type TourAction, type TourState } from './tourReducer'

const reduce = createTourReducer(TOUR_STEPS)
const run = (actions: TourAction[], from: TourState = { status: 'idle' }) => actions.reduce(reduce, from)
const stepOf = (state: TourState) => (state.status === 'running' ? state.stepId : state.status)

/** Presses Next until the tour ends, and lists the steps it showed. */
function walk(role: 'admin' | 'member') {
  let state = run([{ type: 'start' }, { type: 'role', role }])
  const seen: string[] = []
  while (state.status === 'running' && seen.length < 20) {
    seen.push(state.stepId)
    state = reduce(state, { type: 'next' })
  }
  return { seen, end: state.status }
}

describe('tourReducer', () => {
  it('starts on the first step with the role still unknown', () => {
    expect(run([{ type: 'start' }])).toEqual({ status: 'running', stepId: 'nav', role: null, direction: 1 })
  })

  it('walks an admin through the admin steps and ends done', () => {
    expect(walk('admin')).toEqual({ seen: ['nav', 'users', 'inspector', 'replay', 'tokens', 'audit-log', 'done'], end: 'done' })
  })

  it('walks a member through the 403 state instead of the admin steps', () => {
    expect(walk('member')).toEqual({ seen: ['nav', 'admin-required', 'inspector', 'replay', 'tokens', 'done'], end: 'done' })
  })

  it('counts only the steps for the role', () => {
    const admin = run([{ type: 'start' }, { type: 'role', role: 'admin' }, { type: 'next' }, { type: 'next' }])
    expect(progress(TOUR_STEPS, admin)).toMatchObject({ index: 2, total: 7, step: { id: 'inspector' } })
    const member = run([{ type: 'start' }, { type: 'role', role: 'member' }])
    expect(progress(TOUR_STEPS, member)).toMatchObject({ index: 0, total: 6 })
    expect(progress(TOUR_STEPS, { status: 'done' })).toBeNull()
  })

  it('goes back one step, and stays on the first step when there is none before it', () => {
    const second = run([{ type: 'start' }, { type: 'role', role: 'admin' }, { type: 'next' }])
    expect(stepOf(reduce(second, { type: 'back' }))).toBe('nav')
    expect(stepOf(run([{ type: 'back' }, { type: 'back' }], second))).toBe('nav')
  })

  it('ends done on skip or finish from any step', () => {
    const third = run([{ type: 'start' }, { type: 'role', role: 'admin' }, { type: 'next' }, { type: 'next' }])
    expect(reduce(third, { type: 'skip' })).toEqual({ status: 'done' })
    expect(reduce(third, { type: 'finish' })).toEqual({ status: 'done' })
  })

  it('ignores moves while the tour is not running, and starts again after it ended', () => {
    for (const type of ['next', 'back', 'skip', 'missing'] as const) {
      expect(reduce({ status: 'idle' }, { type })).toEqual({ status: 'idle' })
      expect(reduce({ status: 'done' }, { type })).toEqual({ status: 'done' })
    }
    expect(stepOf(reduce({ status: 'done' }, { type: 'start' }))).toBe('nav')
  })

  it('moves on from a step for the other role once the role is known', () => {
    const onUsers: TourState = { status: 'running', stepId: 'users', role: null, direction: 1 }
    expect(reduce(onUsers, { type: 'role', role: 'member' })).toMatchObject({ stepId: 'admin-required', role: 'member' })
    expect(reduce(onUsers, { type: 'role', role: 'admin' })).toMatchObject({ stepId: 'users', role: 'admin' })
  })

  it('skips a step whose target never appeared, in the direction the visitor was going', () => {
    const forward = run([{ type: 'start' }, { type: 'role', role: 'admin' }, { type: 'next' }, { type: 'next' }])
    expect(stepOf(reduce(forward, { type: 'missing' }))).toBe('replay')
    const backward = reduce(forward, { type: 'back' })
    expect(stepOf(reduce(backward, { type: 'missing' }))).toBe('nav')
  })

  it('turns forward when a missing first step has nothing before it, and ends when the last one is missing', () => {
    const steps: TourStep[] = [
      { id: 'a', target: 'nav', title: 'A', body: '', audience: 'all' },
      { id: 'b', target: 'replay', title: 'B', body: '', audience: 'all' },
    ]
    const small = createTourReducer(steps)
    expect(small({ status: 'running', stepId: 'a', role: null, direction: -1 }, { type: 'missing' })).toMatchObject({ stepId: 'b', direction: 1 })
    expect(small({ status: 'running', stepId: 'b', role: null, direction: 1 }, { type: 'missing' })).toEqual({ status: 'done' })
  })
})
