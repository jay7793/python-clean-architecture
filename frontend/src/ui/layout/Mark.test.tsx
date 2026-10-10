import { render } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const reverse = vi.fn()
const animate = vi.fn(() => ({ reverse, cancel() {} }) as unknown as Animation)

function animatedParts() {
  return animate.mock.contexts as unknown as Element[]
}

function prefersReducedMotion(reduce: boolean) {
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: reduce && query === '(prefers-reduced-motion: reduce)',
    addEventListener() {},
    removeEventListener() {},
  }))
}

// The assemble runs once per page load, so every test loads a fresh copy of the module.
async function loadMark() {
  vi.resetModules()
  return (await import('./Mark')).Mark
}

beforeEach(() => {
  animate.mockClear()
  reverse.mockClear()
  Element.prototype.animate = animate
  prefersReducedMotion(false)
})

afterEach(() => {
  delete (Element.prototype as Partial<Element>).animate
  vi.unstubAllGlobals()
})

describe('Mark', () => {
  it('assembles its tile, bars and dot on first appearance', async () => {
    const Mark = await loadMark()
    const { container } = render(<Mark />)

    const parts = animatedParts()
    expect(parts).toContain(container.querySelector('circle'))
    expect(parts.filter((part) => part.tagName === 'rect')).toHaveLength(3)
  })

  it('does not assemble again on rerender or on a later mount in the same page load', async () => {
    const Mark = await loadMark()
    const { rerender } = render(<Mark />)
    const afterFirst = animate.mock.calls.length

    rerender(<Mark />)
    render(<Mark />)

    expect(animate.mock.calls.length).toBe(afterFirst)
  })

  it('pulses the dot and bars when activity changes, and not before', async () => {
    const Mark = await loadMark()
    const { container, rerender } = render(<Mark activity={0} />)
    rerender(<Mark activity={0} />)
    animate.mockClear()

    rerender(<Mark activity={1} />)

    const parts = animatedParts()
    expect(parts).toContain(container.querySelector('circle'))
    expect(parts.filter((part) => part.tagName === 'rect')).toHaveLength(2)
  })

  it('shows the final mark without animating under reduced motion', async () => {
    prefersReducedMotion(true)
    const Mark = await loadMark()
    const { container, rerender } = render(<Mark activity={0} />)
    rerender(<Mark activity={1} />)

    expect(animate).not.toHaveBeenCalled()
    expect(container.querySelector('circle')).toBeInTheDocument()
  })

  it('nudges the bars while the link around it is hovered or focused, and settles back on leave', async () => {
    const Mark = await loadMark()
    const { container } = render(
      <a href="/">
        <Mark />
      </a>,
    )
    const link = container.querySelector('a') as HTMLAnchorElement
    animate.mockClear()

    link.dispatchEvent(new Event('pointerenter'))
    expect(animatedParts().filter((part) => part.tagName === 'rect')).toHaveLength(2)

    animate.mockClear()
    link.dispatchEvent(new Event('focusin', { bubbles: true }))
    link.dispatchEvent(new Event('pointerleave'))
    expect(animate).not.toHaveBeenCalled()
    expect(reverse).not.toHaveBeenCalled()

    link.dispatchEvent(new Event('focusout', { bubbles: true }))
    expect(reverse).toHaveBeenCalledTimes(2)
  })
})
