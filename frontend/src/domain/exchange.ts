export type ExchangeKind = 'request' | 'refresh' | 'retry'

export const NO_RESPONSE = 0

export type Exchange = {
  id: string
  method: string
  path: string
  startedAt: number
  /** Undefined while in flight; NO_RESPONSE when the network call itself failed. */
  status?: number
  traceId?: string
  kind: ExchangeKind
  parentId?: string
  /** On a retry: the id of the rejected call it sends again. */
  repeats?: string
}

/** A refresh with the 401s it rescued and the retries it sent. Members keep the order they were recorded in. */
export type Episode = { rejected: readonly Exchange[]; refresh: Exchange; retries: readonly Exchange[] }

export type TimelineEntry = { type: 'exchange'; exchange: Exchange } | { type: 'episode'; episode: Episode }

/** The log newest first, with each refresh episode as one entry placed by its latest member. */
export function timeline(exchanges: readonly Exchange[]): TimelineEntry[] {
  const episodes = exchanges
    .filter((e) => e.kind === 'refresh')
    .map((refresh): Episode => {
      const retries = exchanges.filter((e) => e.kind === 'retry' && e.parentId === refresh.id)
      const rescued = new Set([refresh.parentId, ...retries.map((e) => e.repeats)])
      const rejected = exchanges.filter((e) => e.kind === 'request' && e.status === 401 && rescued.has(e.id))
      return { rejected, refresh, retries }
    })
  const episodeOf = new Map(episodes.flatMap((episode) => [...episode.rejected, episode.refresh, ...episode.retries].map((e): [string, Episode] => [e.id, episode])))

  const entries: TimelineEntry[] = []
  const placed = new Set<Episode>()
  for (const exchange of [...exchanges].reverse()) {
    const episode = episodeOf.get(exchange.id)
    if (!episode) {
      entries.push({ type: 'exchange', exchange })
    } else if (!placed.has(episode)) {
      placed.add(episode)
      entries.push({ type: 'episode', episode })
    }
  }
  return entries
}

export type ReplayCheck = { passed: boolean; exchanges: readonly Exchange[] }

/** Running until every replayed call, the refresh and each retry has an answer. */
export type ReplayReport =
  | { state: 'running' }
  | { state: 'settled'; rejected: ReplayCheck; refreshed: ReplayCheck; retried: ReplayCheck }

const answered = (e: Exchange) => e.status !== undefined
const succeeded = (e: Exchange) => e.status !== undefined && e.status >= 200 && e.status < 300
/** The API accepted the token: anything but a 401 or no answer at all. A 403 still means the new token worked. */
const accepted = (e: Exchange) => answered(e) && e.status !== 401 && e.status !== NO_RESPONSE

/** Checks a replay of `calls` concurrent calls sent with a broken access token, from the exchanges recorded since it started. */
export function replayReport(since: readonly Exchange[], calls: number): ReplayReport {
  const sent = since.filter((e) => e.kind === 'request').slice(0, calls)
  if (sent.length < calls || !sent.every(answered)) return { state: 'running' }
  const rejected = sent.filter((e) => e.status === 401)
  const refreshes = since.filter((e) => e.kind === 'refresh')
  const retries = since.filter((e) => e.kind === 'retry')
  const refreshFailed = refreshes.length > 0 && refreshes.every((e) => answered(e) && !succeeded(e))
  const retriesDone = refreshes.length > 0 && refreshes.every(answered) && retries.length >= rejected.length && retries.every(answered)
  if (rejected.length > 0 && !refreshFailed && !retriesDone) return { state: 'running' }
  return {
    state: 'settled',
    rejected: { passed: rejected.length === calls, exchanges: rejected },
    refreshed: { passed: refreshes.length === 1 && refreshes.every(succeeded), exchanges: refreshes },
    retried: { passed: rejected.length > 0 && retries.length === rejected.length && retries.every(accepted), exchanges: retries },
  }
}
