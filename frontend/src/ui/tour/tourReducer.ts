import type { Role, TourStep } from './steps'

/** The step is named by id, not index: the list of steps grows or shrinks when the role becomes known. */
export type TourState =
  | { status: 'idle' }
  | { status: 'running'; stepId: string; role: Role | null; direction: 1 | -1 }
  | { status: 'done' }

export type TourAction =
  | { type: 'start' }
  | { type: 'next' }
  | { type: 'back' }
  | { type: 'skip' }
  | { type: 'finish' }
  | { type: 'role'; role: Role }
  | { type: 'missing' }

type Running = Extract<TourState, { status: 'running' }>

const DONE: TourState = { status: 'done' }

/** Until the role is known, the steps of both roles stay in; the page settles which one shows. */
const showsFor = (step: TourStep, role: Role | null) => step.audience === 'all' || role === null || step.audience === role

export function progress(steps: readonly TourStep[], state: TourState): { step: TourStep; index: number; total: number } | null {
  if (state.status !== 'running') return null
  const visible = steps.filter((step) => showsFor(step, state.role))
  const index = visible.findIndex((step) => step.id === state.stepId)
  const step = visible[index]
  return step ? { step, index, total: visible.length } : null
}

export function createTourReducer(steps: readonly TourStep[]) {
  /** The nearest step for the role from `from` in `direction`, the current one included when `inclusive`. */
  function nearest(role: Role | null, from: number, direction: 1 | -1, inclusive: boolean): TourStep | undefined {
    for (let i = inclusive ? from : from + direction; i >= 0 && i < steps.length; i += direction) {
      const step = steps[i]
      if (step && showsFor(step, role)) return step
    }
  }

  const indexOf = (state: Running) => steps.findIndex((step) => step.id === state.stepId)

  function move(state: Running, direction: 1 | -1, inclusive = false): TourState {
    const target = nearest(state.role, indexOf(state), direction, inclusive)
    if (target) return { ...state, stepId: target.id, direction }
    if (direction === -1) return move(state, 1, inclusive)
    return DONE
  }

  return (state: TourState, action: TourAction): TourState => {
    if (action.type === 'start') {
      const first = nearest(null, 0, 1, true)
      return first ? { status: 'running', stepId: first.id, role: null, direction: 1 } : DONE
    }
    if (state.status !== 'running') return state
    switch (action.type) {
      case 'next':
        return move(state, 1)
      case 'back': {
        const previous = nearest(state.role, indexOf(state), -1, false)
        return previous ? { ...state, stepId: previous.id, direction: -1 } : state
      }
      case 'skip':
      case 'finish':
        return DONE
      case 'missing':
        return move(state, state.direction)
      case 'role':
        return move({ ...state, role: action.role }, state.direction, true)
    }
  }
}
