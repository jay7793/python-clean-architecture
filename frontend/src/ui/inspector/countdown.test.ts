import { describe, expect, it } from 'vitest'
import { countdown } from './countdown'

const exp = 2_000_000_000
const secondsBefore = (seconds: number) => (exp - seconds) * 1000

describe('countdown', () => {
  it.each([
    [86_381, '23h 59m 41s'],
    [3_690, '1h 1m 30s'],
    [3_600, '1h 0m 0s'],
    [90, '1m 30s'],
    [7, '0m 7s'],
    [7 * 86_400 - 19, '6d 23h 59m 41s'],
  ])('shows %i seconds left as %s', (left, text) => {
    expect(countdown(exp, secondsBefore(left))).toBe(text)
  })

  it('says expired at and after the expiry', () => {
    expect(countdown(exp, secondsBefore(0))).toBe('expired')
    expect(countdown(exp, secondsBefore(-5))).toBe('expired')
  })
})
