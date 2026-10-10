import type { TourTarget } from './steps'

const shown = (element: HTMLElement) => element.isConnected && element.checkVisibility?.() !== false

/** The sidebar is drawn twice, docked and in the drawer, so the target is the first copy on screen. */
export function visibleTarget(target: TourTarget): HTMLElement | null {
  return [...document.querySelectorAll<HTMLElement>(`[data-tour="${target}"]`)].find(shown) ?? null
}

export function isShown(element: HTMLElement | null): element is HTMLElement {
  return element !== null && shown(element)
}
