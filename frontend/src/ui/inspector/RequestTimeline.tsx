import { useState } from 'react'
import { NO_RESPONSE, timeline, type Episode, type Exchange, type TimelineEntry } from '../../domain/exchange'
import { requestTitle, shortPath, statusLabel } from './requestCopy'

/** Entries shown before "Show N earlier requests". A refresh episode counts as one. */
const VISIBLE = 5

const sizeOf = (entry: TimelineEntry) => (entry.type === 'exchange' ? 1 : entry.episode.rejected.length + 1 + entry.episode.retries.length)

export function RequestTimeline({ exchanges }: { exchanges: readonly Exchange[] }) {
  const [expanded, setExpanded] = useState(false)
  if (exchanges.length === 0) {
    return <p className="py-4 text-sm text-ink-3">No requests yet. Each API call appears here as you use the app.</p>
  }
  const entries = timeline(exchanges)
  const shown = expanded ? entries : entries.slice(0, VISIBLE)
  const hidden = entries.slice(shown.length).reduce((sum, entry) => sum + sizeOf(entry), 0)
  return (
    <>
      <ol className="m-0 grid list-none gap-1 p-0" aria-label="Requests">
        {shown.map((entry) =>
          entry.type === 'exchange' ? (
            <Request key={entry.exchange.id} exchange={entry.exchange} />
          ) : (
            <RefreshEpisode key={entry.episode.refresh.id} episode={entry.episode} />
          ),
        )}
      </ol>
      {hidden > 0 && (
        <button
          type="button"
          className="mt-2 cursor-pointer rounded-full px-3 py-1.5 text-sm font-bold text-g700 transition-[background-color,scale] duration-150 hover:bg-mint active:scale-[0.97]"
          onClick={() => setExpanded(true)}
        >
          Show {hidden} earlier {hidden === 1 ? 'request' : 'requests'}
        </button>
      )}
    </>
  )
}

/** The amber bar on the left groups the 401s with the one refresh that rescued them and the retries it sent. */
function RefreshEpisode({ episode: { rejected, refresh, retries } }: { episode: Episode }) {
  const shared = retries.length
  return (
    <li className="relative py-1 pl-4">
      <span aria-hidden="true" className="absolute top-2 bottom-2 left-0 w-1.5 rounded-full border border-amber-line bg-amber-wash" />
      <ol className="m-0 grid list-none gap-1 p-0" aria-label="Refresh episode">
        {rejected.map((exchange) => (
          <Request key={exchange.id} exchange={exchange} nested />
        ))}
        <Request exchange={refresh} nested tag={shared > 1 ? `One refresh for ${shared} requests` : 'Refresh'} indent />
        {retries.map((exchange) => (
          <Request key={exchange.id} exchange={exchange} nested tag="Retry" indent />
        ))}
      </ol>
    </li>
  )
}

type Tone = 'pending' | 'ok' | 'recoverable' | 'error'

function toneOf({ status, kind }: Exchange): Tone {
  if (status === undefined) return 'pending'
  if (status >= 200 && status < 300) return 'ok'
  return status === 401 && kind !== 'refresh' ? 'recoverable' : 'error'
}

const PILL: Record<Tone, string> = {
  pending: 'bg-mint text-ink-3 ring-rule',
  ok: 'bg-g100 text-g700 ring-g200',
  recoverable: 'bg-amber-wash text-amber-text ring-amber-line',
  error: 'bg-danger-wash text-danger ring-danger-line',
}

type RequestProps = { exchange: Exchange; nested?: boolean; tag?: string; indent?: boolean }

function Request({ exchange, nested = false, tag, indent = false }: RequestProps) {
  const { method, path, status, traceId, kind } = exchange
  const { route, query } = shortPath(path)
  const tone = toneOf(exchange)
  return (
    <li
      className={`grid min-w-0 gap-1 rounded-sm px-2 py-1.5 ${nested ? 'animate-slot-in' : 'animate-row-in'} ${indent ? 'ml-4' : ''} ${kind === 'refresh' ? 'relative overflow-hidden' : ''}`}
      data-tone={tone}
      title={requestTitle(exchange)}
    >
      {kind === 'refresh' && status !== undefined && status !== NO_RESPONSE && (
        <span
          key={status}
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 animate-sweep bg-linear-to-r from-transparent via-pear/50 to-transparent"
        />
      )}
      <span className="relative flex min-w-0 items-baseline gap-2 text-sm">
        <span className="w-12 flex-none font-mono text-xs font-bold text-ink-3">{method}</span>
        <code className="min-w-0 truncate text-ink">
          {route}
          {query && <span className="text-ink-3">{query}</span>}
        </code>
      </span>
      <span className="relative ml-14 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
        <span key={status ?? 'waiting'} className={`animate-pop rounded-full px-2 py-0.5 font-display font-bold ring-1 ${PILL[tone]}`}>
          {statusLabel(status)}
        </span>
        {traceId && <code className="text-ink-2">{traceId}</code>}
        {tag && <span className={kind === 'refresh' ? 'font-bold text-amber-text' : 'text-ink-3'}>{tag}</span>}
      </span>
    </li>
  )
}
