import { replayReport, type Exchange } from '../../domain/exchange'
import { USERS_PAGE_SIZE } from '../../domain/user'
import { useExchanges, useServices, useSession } from '../services'
import { ReplayPanel } from './ReplayPanel'
import { RequestTimeline } from './RequestTimeline'
import { TokenStrip } from './TokenStrip'
import { useNow } from './useNow'

/** Where a replay started: the id of the newest exchange before it, or null when the log was empty. */
export type ReplayMark = { after: string | null }

/** The replay loads Profile and Users at once. */
const REPLAYED_CALLS = 2

/** The exchanges recorded since the mark, or null once the mark has left the log. */
function since(exchanges: readonly Exchange[], { after }: ReplayMark): readonly Exchange[] | null {
  if (after === null) return exchanges
  const index = exchanges.findIndex((e) => e.id === after)
  return index === -1 ? null : exchanges.slice(index + 1)
}

type Props = { replayMark: ReplayMark | null; onReplay: (mark: ReplayMark) => void }

export function Inspector({ replayMark, onReplay }: Props) {
  const { session, decodeClaims } = useServices()
  const current = useSession()
  const exchanges = useExchanges()
  const now = useNow()
  const replayed = replayMark && since(exchanges, replayMark)

  function replay() {
    onReplay({ after: exchanges.at(-1)?.id ?? null })
    session.tamperAccessToken()
    void Promise.allSettled([session.profile(), session.listAdminUsers(1, USERS_PAGE_SIZE)])
  }

  return (
    <div className="min-h-0 flex-1 overflow-auto overscroll-contain">
      <TokenStrip session={current} decode={decodeClaims} now={now} />
      {current.status === 'authenticated' && <ReplayPanel report={replayed ? replayReport(replayed, REPLAYED_CALLS) : null} onReplay={replay} />}
      <section className="px-6 pt-4 pb-6" aria-labelledby="requests-heading">
        <h3 id="requests-heading" className="mb-2 overflow-hidden text-xs font-bold text-ink-3 tabular-nums">
          <span key={exchanges.length} className="inline-block animate-roll">
            {exchanges.length} {exchanges.length === 1 ? 'request' : 'requests'}
          </span>
          , newest first
        </h3>
        <RequestTimeline exchanges={exchanges} />
      </section>
    </div>
  )
}
