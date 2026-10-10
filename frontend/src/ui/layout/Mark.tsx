import { useEffect, useLayoutEffect, useRef } from 'react'

const SETTLE = 'cubic-bezier(0.22, 1, 0.36, 1)'
const POP = 'cubic-bezier(0.16, 1, 0.3, 1)'

export const HOME_LINK_NAME = 'Clean Architecture · Python, home'

// Only the first mark a page load shows assembles. Remounts (the nav drawer, signing in) show it whole.
let assembled = false

function partsOf(svg: SVGSVGElement | null) {
  if (!svg) return null
  const [tile, topBar, bottomBar, dot] = svg.children as unknown as [Element, Element, Element, Element]
  return { svg, tile, bars: [topBar, bottomBar], dot }
}

function motionAllowed() {
  if (!('animate' in Element.prototype)) return false
  return typeof matchMedia !== 'function' || !matchMedia('(prefers-reduced-motion: reduce)').matches
}

/** `activity` is any value that changes when something happens; each change pulses the mark once. */
export function Mark({ activity }: { activity?: number | string }) {
  const svg = useRef<SVGSVGElement>(null)
  const lastActivity = useRef(activity)

  useLayoutEffect(() => {
    const parts = partsOf(svg.current)
    if (!parts || assembled || !motionAllowed() || parts.svg.checkVisibility?.() === false) return
    assembled = true
    parts.tile.animate([{ transform: 'scale(0.6)', opacity: 0 }, { transform: 'none', opacity: 1 }], {
      duration: 320,
      easing: POP,
      fill: 'backwards',
    })
    parts.bars.forEach((bar, i) =>
      bar.animate([{ transform: 'scaleX(0)' }, { transform: 'none' }], {
        duration: 280,
        delay: 140 + i * 40,
        easing: SETTLE,
        fill: 'backwards',
      }),
    )
    parts.dot.animate(
      [{ transform: 'scale(0)' }, { transform: 'scale(1.15)', offset: 0.6 }, { transform: 'none' }],
      { duration: 260, delay: 320, easing: POP, fill: 'backwards' },
    )
  }, [])

  useEffect(() => {
    if (Object.is(lastActivity.current, activity)) return
    lastActivity.current = activity
    const parts = partsOf(svg.current)
    if (!parts || !motionAllowed()) return
    parts.dot.animate(
      [{ transform: 'none' }, { transform: 'scale(1.25)', offset: 0.4 }, { transform: 'none' }],
      { duration: 320, easing: POP, composite: 'add' },
    )
    parts.bars.forEach((bar, i) =>
      bar.animate(
        [{ transform: 'none' }, { transform: 'scaleX(0.8)', offset: 0.35 }, { transform: 'none' }],
        { duration: 300, delay: i * 40, easing: SETTLE, composite: 'add' },
      ),
    )
  }, [activity])

  useEffect(() => {
    const parts = partsOf(svg.current)
    const link = parts?.svg.closest('a')
    if (!parts || !link) return
    const { bars } = parts
    let hovered = false
    let focused = false
    let nudged = false
    let nudge: Animation[] | null = null

    function update() {
      const wanted = hovered || focused
      if (wanted === nudged || !motionAllowed()) return
      nudged = wanted
      if (nudge) return nudge.forEach((animation) => animation.reverse())
      nudge = bars.map((bar, i) =>
        bar.animate([{ transform: 'none' }, { transform: `translateX(${3 - i}px)` }], {
          duration: 200,
          easing: SETTLE,
          fill: 'forwards',
          composite: 'add',
        }),
      )
    }
    const listeners: [string, () => void][] = [
      ['pointerenter', () => ((hovered = true), update())],
      ['pointerleave', () => ((hovered = false), update())],
      ['focusin', () => ((focused = true), update())],
      ['focusout', () => ((focused = false), update())],
    ]
    listeners.forEach(([type, listener]) => link.addEventListener(type, listener))
    return () => {
      listeners.forEach(([type, listener]) => link.removeEventListener(type, listener))
      nudge?.forEach((animation) => animation.cancel())
    }
  }, [])

  return (
    <svg ref={svg} className="size-7 flex-none" viewBox="0 0 24 24" aria-hidden="true">
      <rect style={centre} width="24" height="24" rx="7" fill="#1f3a24" />
      <rect style={leftEdge} x="5" y="12.5" width="14" height="3" rx="1.5" fill="#bddcbf" />
      <rect style={leftEdge} x="5" y="17" width="9" height="3" rx="1.5" fill="#5e9e62" />
      <circle style={centre} cx="15.5" cy="7.5" r="3" fill="#b5d95a" />
    </svg>
  )
}

const centre = { transformBox: 'fill-box', transformOrigin: 'center' } as const
const leftEdge = { transformBox: 'fill-box', transformOrigin: 'left center' } as const
