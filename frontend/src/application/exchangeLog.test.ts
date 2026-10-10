import { describe, expect, it, vi } from 'vitest'
import { ExchangeLog } from './exchangeLog'

const profileCall = { id: 'x1', kind: 'request', method: 'GET', path: '/api/v1/users/profile' } as const

describe('ExchangeLog', () => {
  it('stamps an opened exchange with the clock and fills in the response when it closes', () => {
    const log = new ExchangeLog({ now: () => 1_000 })

    log.open(profileCall)
    expect(log.list()).toEqual([{ ...profileCall, startedAt: 1_000 }])

    log.close('x1', 401, 'middleware-002')
    expect(log.list()).toEqual([{ ...profileCall, startedAt: 1_000, status: 401, traceId: 'middleware-002' }])
  })

  it('publishes a new snapshot to subscribers on every change and stops after unsubscribe', () => {
    const log = new ExchangeLog({ now: () => 0 })
    const listener = vi.fn()
    const unsubscribe = log.subscribe(listener)
    const before = log.list()

    log.open(profileCall)
    log.close('x1', 200)
    unsubscribe()
    log.open({ ...profileCall, id: 'x2' })

    expect(listener).toHaveBeenCalledTimes(2)
    expect(log.list()).not.toBe(before)
  })

  it('keeps only the most recent exchanges', () => {
    const log = new ExchangeLog({ now: () => 0 }, 2)

    for (const id of ['x1', 'x2', 'x3']) log.open({ ...profileCall, id })

    expect(log.list().map((e) => e.id)).toEqual(['x2', 'x3'])
  })

  it('forgets a discarded exchange and keeps the others', () => {
    const log = new ExchangeLog({ now: () => 0 })
    log.open(profileCall)
    log.open({ ...profileCall, id: 'x2' })

    log.discard('x1')

    expect(log.list().map((e) => e.id)).toEqual(['x2'])
  })

  it('empties on clear and tells subscribers', () => {
    const log = new ExchangeLog({ now: () => 0 })
    log.open(profileCall)
    const listener = vi.fn()
    log.subscribe(listener)

    log.clear()

    expect(log.list()).toEqual([])
    expect(listener).toHaveBeenCalledTimes(1)
  })
})
