import { Button } from '@base-ui/react/button'
import { useId, useLayoutEffect, useRef, type KeyboardEvent } from 'react'
import { createPortal } from 'react-dom'
import { compactPrimaryButton, secondaryButton } from '../components/classes'
import { useMediaQuery } from '../components/useMediaQuery'
import { holeAround, placeCard, ringPath, scrimPath } from './geometry'
import type { TourStep } from './steps'
import { visibleTarget } from './targets'

type Props = {
  progress: { step: TourStep; index: number; total: number }
  /** Null while the step's target is still on its way; `element` is null for a step with no target. */
  found: { element: HTMLElement | null } | null
  onBack: () => void
  onNext: () => void
  onSkip: () => void
  onFinish: () => void
}

/** On a phone the card docks above the inspector button: its 56px plus the 16px margin and a 12px gap. */
const DOCK_ABOVE_BUTTON = 84
const DOCK_IN_PANEL = 12
const GLIDE_MS = 360
const PANELS_SETTLE_MS = 600

export function TourOverlay({ progress: { step, index, total }, found, onBack, onNext, onSkip, onFinish }: Props) {
  // The same query the inspector uses: below it the inspector is a modal drawer, as the nav drawer always is.
  const narrow = !useMediaQuery('(min-width: 640px)')
  const layer = useRef<HTMLDivElement>(null)
  const scrim = useRef<HTMLDivElement>(null)
  const ring = useRef<HTMLDivElement>(null)
  const card = useRef<HTMLElement>(null)
  const next = useRef<HTMLButtonElement>(null)
  const titleId = useId()
  const bodyId = useId()
  const element = found?.element ?? null
  const last = index === total - 1

  // A modal hides and locks out everything outside it, so the tour draws inside the open panel.
  const modal = step.reveal === 'nav-drawer' || (step.reveal === 'inspector' && narrow)
  const insideModal = Boolean(element && modal)
  const container = (insideModal && element?.closest<HTMLElement>('[role="dialog"]')) || document.body

  // The spotlight glides only when it moves to a new target; while it follows one, it keeps up without lag.
  // This runs before the first frame below draws the new hole, so that change is the one that glides.
  useLayoutEffect(() => {
    const host = layer.current
    if (!host || !found) return
    host.toggleAttribute('data-glide', true)
    const timer = setTimeout(() => host.removeAttribute('data-glide'), GLIDE_MS)
    return () => clearTimeout(timer)
  }, [found])

  // Each frame reads the target's box, so the spotlight and the card follow it through scrolling, resizing and the panels' own motion.
  useLayoutEffect(() => {
    let frame = 0
    const tick = () => {
      frame = requestAnimationFrame(tick)
      const area = layer.current?.getBoundingClientRect()
      if (!area || !found) return
      const live = element?.isConnected ? element : step.target && visibleTarget(step.target)
      const box = live ? live.getBoundingClientRect() : null
      const size = { w: area.width, h: area.height }
      const hole = holeAround(box && { x: box.left - area.left, y: box.top - area.top, w: box.width, h: box.height }, size)
      scrim.current?.style.setProperty('clip-path', scrimPath(hole, size))
      ring.current?.style.setProperty('clip-path', ringPath(hole))
      const popup = card.current
      if (!popup) return
      const dock = narrow ? (container === document.body ? DOCK_ABOVE_BUTTON : DOCK_IN_PANEL) : null
      const place = placeCard(hole, { w: popup.offsetWidth, h: popup.offsetHeight }, size, { centred: !step.target, dock })
      popup.style.translate = `${place.x}px ${place.y}px`
      popup.style.transformOrigin = place.origin
    }
    tick()
    return () => cancelAnimationFrame(frame)
  }, [found, element, step, narrow, container])

  // Focus moves in the commit that shows the card, so the first key press after it appears reaches it.
  // Opening or closing a panel moves focus too: the inspector focuses itself as it opens, and the nav drawer hands focus
  // back to its menu button once it has closed. For a moment after the card appears, it takes focus back from them.
  useLayoutEffect(() => {
    if (!found) return
    const focus = () => next.current?.focus({ preventScroll: true })
    let frame = 0
    const reclaim = (event: FocusEvent) => {
      if (event.target instanceof Node && card.current?.contains(event.target)) return
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(focus)
    }
    const stop = () => {
      document.removeEventListener('focusin', reclaim, true)
      clearTimeout(timer)
      cancelAnimationFrame(frame)
    }
    const timer = setTimeout(stop, PANELS_SETTLE_MS)
    document.addEventListener('focusin', reclaim, true)
    focus()
    return stop
  }, [found])

  function onKeyDown(event: KeyboardEvent) {
    const action = { Escape: onSkip, ArrowLeft: onBack, ArrowRight: last ? onFinish : onNext }[event.key]
    if (!action) return
    event.preventDefault()
    event.stopPropagation()
    action()
  }

  return createPortal(
    <div ref={layer} className="group pointer-events-none fixed inset-0 z-50">
      <div
        ref={scrim}
        aria-hidden="true"
        className="absolute inset-0 bg-g900/30 transition-opacity duration-300 starting:opacity-0 group-data-[glide]:transition-[clip-path,opacity] group-data-[glide]:duration-[320ms] group-data-[glide]:ease-out"
      />
      <div
        ref={ring}
        aria-hidden="true"
        className="absolute inset-0 bg-pear transition-opacity duration-300 starting:opacity-0 group-data-[glide]:transition-[clip-path,opacity] group-data-[glide]:duration-[320ms] group-data-[glide]:ease-out"
        hidden={!element}
      />
      {found && (
        <section
          key={step.id}
          ref={card}
          role="dialog"
          aria-labelledby={titleId}
          aria-describedby={bodyId}
          tabIndex={-1}
          onKeyDown={onKeyDown}
          className="pointer-events-auto absolute top-0 left-0 w-[340px] max-w-[calc(100%-24px)] rounded-md bg-white p-5 shadow-lg ring-1 ring-rule outline-none transition-[scale,opacity] duration-300 ease-pop starting:scale-90 starting:opacity-0 max-sm:w-[calc(100%-24px)]"
        >
          <div className="flex items-baseline gap-3">
            <h2 id={titleId} className="flex-1 font-bold text-balance text-g900">
              {step.title}
            </h2>
            <span className="flex-none text-sm text-ink-3 tabular-nums">
              {index + 1} of {total}
            </span>
          </div>
          <p id={bodyId} className="mt-1.5 text-sm text-pretty text-ink-2">
            {step.body}
          </p>
          <div className="mt-5 flex items-center gap-2">
            {!last && (
              <Button className="mr-auto -ml-2 h-9 cursor-pointer rounded-full px-2 text-sm font-bold whitespace-nowrap text-ink-3 transition-colors hover:text-g900" onClick={onSkip}>
                Skip tour
              </Button>
            )}
            {index > 0 && (
              <Button className={`${secondaryButton} ${last ? 'ml-auto' : ''}`} onClick={onBack}>
                Back
              </Button>
            )}
            <Button ref={next} className={`${compactPrimaryButton} ${last && index === 0 ? 'ml-auto' : ''}`} onClick={last ? onFinish : onNext}>
              {last ? 'Done' : 'Next'}
            </Button>
          </div>
        </section>
      )}
    </div>,
    container,
  )
}
