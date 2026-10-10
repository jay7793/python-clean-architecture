export type Box = { x: number; y: number; w: number; h: number }
export type Size = { w: number; h: number }

const MARGIN = 12
const GAP = 12
const HOLE_PADDING = 6
const HOLE_RADIUS = 14
const RING = 3

/** The cut-out around the target, kept inside the layer so its ring never runs off the screen. A missing target is a point in the middle. */
export function holeAround(target: Box | null, area: Size): Box {
  if (!target) return { x: area.w / 2, y: area.h / 2, w: 0, h: 0 }
  const x = Math.max(RING, target.x - HOLE_PADDING)
  const y = Math.max(RING, target.y - HOLE_PADDING)
  const right = Math.min(area.w - RING, target.x + target.w + HOLE_PADDING)
  const bottom = Math.min(area.h - RING, target.y + target.h + HOLE_PADDING)
  return { x, y, w: Math.max(0, right - x), h: Math.max(0, bottom - y) }
}

/** Every hole is drawn with the same commands, so the browser can interpolate one path into the next. */
function roundedRect({ x, y, w, h }: Box, radius: number): string {
  const r = Math.min(radius, w / 2, h / 2)
  return (
    `M${x + r},${y} H${x + w - r} A${r},${r} 0 0 1 ${x + w},${y + r} V${y + h - r} A${r},${r} 0 0 1 ${x + w - r},${y + h} ` +
    `H${x + r} A${r},${r} 0 0 1 ${x},${y + h - r} V${y + r} A${r},${r} 0 0 1 ${x + r},${y} Z`
  )
}

export function scrimPath(hole: Box, area: Size): string {
  return `path(evenodd, "M0,0 H${area.w} V${area.h} H0 Z ${roundedRect(hole, HOLE_RADIUS)}")`
}

export function ringPath(hole: Box): string {
  const outer = { x: hole.x - RING, y: hole.y - RING, w: hole.w + 2 * RING, h: hole.h + 2 * RING }
  return `path(evenodd, "${roundedRect(outer, HOLE_RADIUS + RING)} ${roundedRect(hole, HOLE_RADIUS)}")`
}

export type CardPlacement = { x: number; y: number; origin: string }

const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), Math.max(min, max))

/**
 * Below the hole, else above, else beside it; the card grows from the point nearest the target.
 * `dock` pins the card to the bottom of a narrow screen, that many pixels up, and leaves the target uncovered above it.
 */
export function placeCard(hole: Box, card: Size, area: Size, { centred, dock }: { centred: boolean; dock: number | null }): CardPlacement {
  const centreX = hole.x + hole.w / 2
  const centreY = hole.y + hole.h / 2
  const alongX = clamp(centreX - card.w / 2, MARGIN, area.w - card.w - MARGIN)
  const alongY = clamp(hole.y, MARGIN, area.h - card.h - MARGIN)
  const originX = `${clamp(centreX - alongX, 0, card.w)}px`
  const originY = `${clamp(centreY - alongY, 0, card.h)}px`

  if (dock !== null) {
    const y = area.h - card.h - dock
    return { x: (area.w - card.w) / 2, y, origin: centreY < y ? `${originX} 0` : `${originX} ${card.h}px` }
  }
  if (centred) return { x: (area.w - card.w) / 2, y: (area.h - card.h) / 2, origin: 'center' }

  const below = hole.y + hole.h + GAP
  if (below + card.h <= area.h - MARGIN) return { x: alongX, y: below, origin: `${originX} 0` }
  const above = hole.y - GAP - card.h
  if (above >= MARGIN) return { x: alongX, y: above, origin: `${originX} ${card.h}px` }
  const right = hole.x + hole.w + GAP
  if (right + card.w <= area.w - MARGIN) return { x: right, y: alongY, origin: `0 ${originY}` }
  const left = hole.x - GAP - card.w
  if (left >= MARGIN) return { x: left, y: alongY, origin: `${card.w}px ${originY}` }
  return { x: alongX, y: area.h - card.h - MARGIN, origin: `${originX} ${card.h}px` }
}
