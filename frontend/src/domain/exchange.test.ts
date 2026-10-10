import { describe, expect, it } from 'vitest'
import { NO_RESPONSE, replayReport, timeline, type Exchange, type TimelineEntry } from './exchange'

const profile = '/api/v1/users/profile'
const users = '/api/v1/admin/users?_page=1&_pageSize=10'

const at = (startedAt: number, rest: Partial<Exchange> & Pick<Exchange, 'id'>): Exchange => ({
  method: 'GET',
  path: profile,
  kind: 'request',
  startedAt,
  ...rest,
})

/** A replay as the log records it: two 401s, one shared refresh, and a retry of each. */
const replay = (retryStatuses: [number | undefined, number | undefined]): Exchange[] => [
  at(1, { id: 'a', status: 401, traceId: 'middleware-002' }),
  at(2, { id: 'b', path: users, status: 401, traceId: 'middleware-002' }),
  at(3, { id: 'r', kind: 'refresh', parentId: 'a', method: 'POST', path: '/api/v1/users/refresh-token', status: 200 }),
  at(4, { id: 'ra', kind: 'retry', parentId: 'r', repeats: 'a', status: retryStatuses[0] }),
  at(5, { id: 'rb', kind: 'retry', parentId: 'r', repeats: 'b', path: users, status: retryStatuses[1], ...(retryStatuses[1] === 403 && { traceId: 'middleware-004' }) }),
]

const ids = (entries: TimelineEntry[]) =>
  entries.map((entry) =>
    entry.type === 'exchange'
      ? entry.exchange.id
      : { rejected: entry.episode.rejected.map((e) => e.id), refresh: entry.episode.refresh.id, retries: entry.episode.retries.map((e) => e.id) },
  )

describe('timeline', () => {
  it('puts the newest entry first and folds two 401s, their shared refresh and both retries into one episode', () => {
    const log = [
      at(0, { id: 'login', method: 'POST', path: '/api/v1/users/login', status: 200 }),
      ...replay([200, 200]),
      at(6, { id: 'later', status: 200 }),
    ]

    expect(ids(timeline(log))).toEqual(['later', { rejected: ['a', 'b'], refresh: 'r', retries: ['ra', 'rb'] }, 'login'])
  })

  it('keeps a 401 that no retry repeats outside the episode', () => {
    const log = [
      at(0, { id: 'stray', method: 'DELETE', path: '/api/v1/admin/users/9', status: 401, traceId: 'middleware-002' }),
      at(1, { id: 'a', status: 401, traceId: 'middleware-002' }),
      at(2, { id: 'r', kind: 'refresh', parentId: 'a', method: 'POST', path: '/api/v1/users/refresh-token', status: 200 }),
      at(3, { id: 'ra', kind: 'retry', parentId: 'r', repeats: 'a', status: 200 }),
    ]

    expect(ids(timeline(log))).toEqual([{ rejected: ['a'], refresh: 'r', retries: ['ra'] }, 'stray'])
  })

  it('folds in the 401 each retry repeats, not an older 401 to the same path', () => {
    const log = [
      at(0, { id: 'stray', status: 401, traceId: 'middleware-002' }),
      ...replay([200, 200]),
    ]

    expect(ids(timeline(log))).toEqual([{ rejected: ['a', 'b'], refresh: 'r', retries: ['ra', 'rb'] }, 'stray'])
  })

  it('shows a retry whose refresh is no longer in the log as a plain entry', () => {
    expect(ids(timeline([at(1, { id: 'retry', kind: 'retry', parentId: 'trimmed', status: 200 })]))).toEqual(['retry'])
  })
})

describe('replayReport', () => {
  it('passes all three checks for a member, whose Users retry is accepted and then refused with 403', () => {
    const report = replayReport(replay([200, 403]), 2)

    expect(report).toEqual({
      state: 'settled',
      rejected: { passed: true, exchanges: [expect.objectContaining({ id: 'a' }), expect.objectContaining({ id: 'b' })] },
      refreshed: { passed: true, exchanges: [expect.objectContaining({ id: 'r' })] },
      retried: { passed: true, exchanges: [expect.objectContaining({ id: 'ra' }), expect.objectContaining({ id: 'rb', status: 403 })] },
    })
  })

  it('keeps running until every retry has an answer', () => {
    expect(replayReport(replay([200, undefined]), 2)).toEqual({ state: 'running' })
    expect(replayReport(replay([200, 200]).slice(0, 3), 2)).toEqual({ state: 'running' })
  })

  it('fails the refresh check when each 401 sent its own refresh', () => {
    const log = [
      at(1, { id: 'a', status: 401 }),
      at(2, { id: 'b', path: users, status: 401 }),
      at(3, { id: 'r1', kind: 'refresh', parentId: 'a', method: 'POST', path: '/api/v1/users/refresh-token', status: 200 }),
      at(4, { id: 'r2', kind: 'refresh', parentId: 'b', method: 'POST', path: '/api/v1/users/refresh-token', status: 200 }),
      at(5, { id: 'ra', kind: 'retry', parentId: 'r1', status: 200 }),
      at(6, { id: 'rb', kind: 'retry', parentId: 'r2', path: users, status: 200 }),
    ]

    const report = replayReport(log, 2)

    expect(report.state === 'settled' && [report.rejected.passed, report.refreshed.passed, report.retried.passed]).toEqual([true, false, true])
  })

  it('fails every check when the API accepts the broken token', () => {
    const report = replayReport([at(1, { id: 'a', status: 200 }), at(2, { id: 'b', path: users, status: 200 })], 2)

    expect(report.state === 'settled' && [report.rejected.passed, report.refreshed.passed, report.retried.passed]).toEqual([false, false, false])
  })

  it('settles with failed refresh and retry checks when the refresh gets no answer', () => {
    const log = [
      at(1, { id: 'a', status: 401 }),
      at(2, { id: 'b', path: users, status: 401 }),
      at(3, { id: 'r', kind: 'refresh', parentId: 'a', method: 'POST', path: '/api/v1/users/refresh-token', status: NO_RESPONSE }),
    ]

    const report = replayReport(log, 2)

    expect(report.state === 'settled' && [report.rejected.passed, report.refreshed.passed, report.retried.passed]).toEqual([true, false, false])
  })
})
