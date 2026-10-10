import { createContext, useContext, useEffect, useEffectEvent, useMemo, useReducer, useRef, useState, type ReactNode } from 'react'
import { useLocation, useNavigate } from 'react-router'
import { firstVisit, rememberSeen } from './seen'
import { ROLE_EVIDENCE, TOUR_STEPS, type Reveal, type Role, type TourStep } from './steps'
import { isShown, visibleTarget } from './targets'
import { createTourReducer, progress } from './tourReducer'
import { TourOverlay } from './TourOverlay'

/** The panels a step can open before it looks for its target. Their owner keeps the state; the tour only asks. */
export type Panels = Record<Reveal, { open: boolean; onOpenChange: (open: boolean) => void }>

type Props = {
  panels: Panels
  steps?: readonly TourStep[]
  /** How long a step waits for its target before the tour skips it. */
  timeoutMs?: number
  children: ReactNode
}

type Tour = { start: () => void; registerStartButton: (button: HTMLButtonElement | null) => void }

const TourContext = createContext<Tour | null>(null)

export function useTour(): Tour | null {
  return useContext(TourContext)
}

/** A step found on screen; `element` is null for a step with no target. */
type Found = { stepId: string; element: HTMLElement | null }

const GUEST_ROUTES = ['/login', '/register']

export function GuidedTour({ panels, steps = TOUR_STEPS, timeoutMs = 4000, children }: Props) {
  const reducer = useMemo(() => createTourReducer(steps), [steps])
  const [state, dispatch] = useReducer(reducer, { status: 'idle' })
  const [found, setFound] = useState<Found | null>(null)
  const startButton = useRef<HTMLButtonElement>(null)
  const revealed = useRef(new Set<Reveal>())
  const { pathname } = useLocation()
  const navigate = useNavigate()
  const current = progress(steps, state)
  const stepId = current?.step.id
  const role = state.status === 'running' ? state.role : null
  const onGuestRoute = GUEST_ROUTES.includes(pathname)

  /** The tour closes only the panels it opened. */
  const closeRevealsExcept = useEffectEvent((keep: Reveal | undefined) => {
    for (const reveal of revealed.current) {
      if (reveal === keep) continue
      panels[reveal].onOpenChange(false)
      revealed.current.delete(reveal)
    }
  })

  // A sign-in first renders the signed-in shell on /login and redirects from there; a restored session never passes a guest route.
  // So the tour opens after a sign-in, once the redirect has landed, and not on a reload.
  const [signedInHere] = useState(onGuestRoute)
  const autoStarted = useRef(false)
  useEffect(() => {
    if (!signedInHere || onGuestRoute || autoStarted.current) return
    autoStarted.current = true
    if (!firstVisit()) return
    rememberSeen()
    dispatch({ type: 'start' })
  }, [signedInHere, onGuestRoute])

  const enterStep = useEffectEvent((step: TourStep) => {
    closeRevealsExcept(step.reveal)
    if (step.route && pathname !== step.route) navigate(step.route)
    if (step.reveal && !revealed.current.has(step.reveal) && !(step.target && visibleTarget(step.target))) {
      revealed.current.add(step.reveal)
      if (!panels[step.reveal].open) panels[step.reveal].onOpenChange(true)
    }
  })
  // Once per step: a later render of the same step must not navigate back or reopen what the visitor closed.
  useEffect(() => {
    const step = steps.find(({ id }) => id === stepId)
    if (step) enterStep(step)
  }, [stepId, steps])

  useEffect(() => {
    if (state.status !== 'running' || role !== null) return
    const detect = () => {
      const shown = (Object.keys(ROLE_EVIDENCE) as Role[]).find((candidate) => visibleTarget(ROLE_EVIDENCE[candidate]))
      if (shown) dispatch({ type: 'role', role: shown })
      return shown !== undefined
    }
    if (detect()) return
    const observer = new MutationObserver(() => detect() && observer.disconnect())
    observer.observe(document.body, { childList: true, subtree: true })
    return () => observer.disconnect()
  }, [state.status, role])

  useEffect(() => {
    const step = steps.find(({ id }) => id === stepId)
    if (!step) return
    const startedAt = performance.now()
    const look = (): Found | null => {
      const element = step.target ? visibleTarget(step.target) : null
      if (step.target && !element) return null
      if (step.waitFor === 'role' && role === null && performance.now() - startedAt < timeoutMs) return null
      return { stepId: step.id, element }
    }
    const settle = () => {
      const result = look()
      if (result) setFound(result)
      return result !== null
    }
    const observer = new MutationObserver(() => settle() && stop())
    const timer = setTimeout(() => settle() || dispatch({ type: 'missing' }), timeoutMs)
    const frame = requestAnimationFrame(() => settle() && stop())
    function stop() {
      observer.disconnect()
      clearTimeout(timer)
      cancelAnimationFrame(frame)
    }
    observer.observe(document.body, { childList: true, subtree: true })
    return stop
  }, [stepId, steps, role, timeoutMs])

  const wasRunning = useRef(false)
  useEffect(() => {
    if (state.status === 'running') {
      wasRunning.current = true
      return
    }
    if (!wasRunning.current) return
    wasRunning.current = false
    closeRevealsExcept(undefined)
    if (isShown(startButton.current)) startButton.current.focus()
    else if (document.activeElement instanceof HTMLElement) document.activeElement.blur()
  }, [state.status])

  const tour = useMemo<Tour>(
    () => ({
      // A restart may land on the step it ended on, so the old target must not stand in for the new search.
      start: () => {
        setFound(null)
        dispatch({ type: 'start' })
      },
      registerStartButton: (button) => {
        startButton.current = button
      },
    }),
    [],
  )
  const shown = current && found?.stepId === current.step.id ? found : null

  return (
    <TourContext value={tour}>
      {children}
      {current && (
        <TourOverlay
          progress={current}
          found={shown}
          onBack={() => dispatch({ type: 'back' })}
          onNext={() => dispatch({ type: 'next' })}
          onSkip={() => dispatch({ type: 'skip' })}
          onFinish={() => dispatch({ type: 'finish' })}
        />
      )}
    </TourContext>
  )
}
