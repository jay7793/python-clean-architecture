const KEY = 'guided-tour-seen'

/** False when storage is unavailable: with nothing to remember it by, the tour would open on every load. */
export function firstVisit(): boolean {
  try {
    return localStorage.getItem(KEY) === null
  } catch {
    return false
  }
}

export function rememberSeen(): void {
  try {
    localStorage.setItem(KEY, '1')
  } catch {
    // Without storage the tour already stays shut on the next load (see firstVisit).
  }
}
