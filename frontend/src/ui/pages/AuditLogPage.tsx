import { Button } from '@base-ui/react/button'
import { Collapsible } from '@base-ui/react/collapsible'
import { Field } from '@base-ui/react/field'
import { ChevronDown, ChevronLeft, ChevronRight, RotateCw } from 'lucide-react'
import { useEffect, useEffectEvent, useState, type CSSProperties } from 'react'
import { useSearchParams } from 'react-router'
import { AUDIT_ACTIONS, OUTCOMES, type AuditEvent, type AuditFilters } from '../../domain/audit'
import type { Page } from '../../domain/user'
import { AdminRequired } from '../components/AdminRequired'
import { ApiErrorNote } from '../components/ApiErrorNote'
import { card, filterControl, filterLabel, secondaryButton } from '../components/classes'
import { FilterSelect } from '../components/FilterSelect'
import { RelativeTime } from '../components/RelativeTime'
import { ShimmerBar } from '../components/Shimmer'
import { useApiLoad } from '../components/useApiLoad'
import { useNow } from '../inspector/useNow'
import { useServices } from '../services'
import { ACTION_LABELS, DETAIL_LABELS, OUTCOME_LABELS } from './auditLabels'

const AUDIT_PAGE_SIZE = 20
const ACTOR_DEBOUNCE_MS = 300
const ANY = 'any'

const ROW_ENTRANCE = { first: 'animate-slot-in', next: 'animate-page-next', back: 'animate-page-back' }

type Query = { filters: AuditFilters; page: number }

/** The filters and the page live in the address (?action=&outcome=&actor=&page=), so a reload or a shared link keeps them. */
function queryOf(params: URLSearchParams): Query {
  const action = AUDIT_ACTIONS.find((value) => value === params.get('action'))
  const outcome = OUTCOMES.find((value) => value === params.get('outcome'))
  const actorEmail = params.get('actor')?.trim()
  const page = Number(params.get('page'))
  return {
    filters: { ...(action && { action }), ...(outcome && { outcome }), ...(actorEmail && { actorEmail }) },
    page: Number.isInteger(page) && page > 1 ? page : 1,
  }
}

function paramsOf({ filters: { action, outcome, actorEmail }, page }: Query): Record<string, string> {
  return {
    ...(action && { action }),
    ...(outcome && { outcome }),
    ...(actorEmail && { actor: actorEmail }),
    ...(page > 1 && { page: String(page) }),
  }
}

export function AuditLogPage() {
  return (
    <div className={`${card} animate-rise overflow-hidden`}>
      <p className="border-b border-rule px-5 py-4 text-sm text-pretty text-ink-3 sm:px-6">
        Sign-ins, token refreshes and admin changes, newest first, from <code>GET /api/v1/admin/audit-logs</code>. The log is
        append-only: nothing here can be edited or deleted.
      </p>
      <AuditLog />
    </div>
  )
}

function AuditLog() {
  const { session } = useServices()
  const [params, setParams] = useSearchParams()
  const query = queryOf(params)
  const queryKey = JSON.stringify(query)
  const [direction, setDirection] = useState<keyof typeof ROW_ENTRANCE>('first')
  const [refreshes, setRefreshes] = useState(0)
  // Events with a higher id than this arrived after the visitor pressed Refresh. Ids only grow.
  const [sweepAfter, setSweepAfter] = useState<number | null>(null)
  const load = useApiLoad(`${queryKey}:${refreshes}`, (signal) =>
    session.listAuditLogs(query.filters, query.page, AUDIT_PAGE_SIZE, signal),
  )

  // A refresh keeps the current rows on screen, so only the events that are new mount and animate.
  const [shown, setShown] = useState<{ key: string; page: Page<AuditEvent> } | null>(null)
  if (load.status === 'loaded' && shown?.page !== load.value) setShown({ key: queryKey, page: load.value })
  const visible = load.status === 'loaded' ? load.value : shown?.key === queryKey ? shown.page : null

  const change = (next: Query) => {
    setDirection(next.page === query.page ? 'first' : next.page > query.page ? 'next' : 'back')
    setSweepAfter(null)
    setParams(paramsOf(next))
  }
  const filter = (filters: AuditFilters) => change({ filters, page: 1 })
  const refresh = () => {
    setSweepAfter(Math.max(0, ...(visible?.data.map((event) => event.id) ?? [])))
    setRefreshes((count) => count + 1)
  }

  return (
    <>
      <Filters query={query} busy={load.status === 'loading'} onFilter={filter} onRefresh={refresh} />
      {load.status === 'forbidden' ? (
        <AdminRequired error={load.error} />
      ) : load.status === 'failed' ? (
        <div className="p-5">
          <ApiErrorNote error={load.error} />
        </div>
      ) : visible ? (
        <Events
          page={visible}
          filtered={Object.keys(query.filters).length > 0}
          entrance={ROW_ENTRANCE[direction]}
          sweepAfter={sweepAfter}
          busy={load.status === 'loading'}
          onPage={(page) => change({ ...query, page })}
        />
      ) : (
        <EventsSkeleton />
      )}
    </>
  )
}

const ACTION_ITEMS = [{ value: ANY, label: 'All actions' }, ...AUDIT_ACTIONS.map((value) => ({ value, label: ACTION_LABELS[value] }))]
const OUTCOME_ITEMS = [{ value: ANY, label: 'Any outcome' }, ...OUTCOMES.map((value) => ({ value, label: OUTCOME_LABELS[value] }))]

type FiltersProps = { query: Query; busy: boolean; onFilter: (filters: AuditFilters) => void; onRefresh: () => void }

function Filters({ query: { filters }, busy, onFilter, onRefresh }: FiltersProps) {
  return (
    <div className="flex flex-wrap items-end gap-3 border-b border-rule px-5 py-4 sm:px-6">
      <FilterSelect
        label="Action"
        className="w-full @lg:w-56"
        items={ACTION_ITEMS}
        value={filters.action ?? ANY}
        onChange={(value) => onFilter({ ...filters, action: AUDIT_ACTIONS.find((known) => known === value) })}
      />
      <FilterSelect
        label="Outcome"
        className="w-full @lg:w-44"
        items={OUTCOME_ITEMS}
        value={filters.outcome ?? ANY}
        onChange={(value) => onFilter({ ...filters, outcome: OUTCOMES.find((known) => known === value) })}
      />
      <ActorFilter value={filters.actorEmail ?? ''} onChange={(actorEmail) => onFilter({ ...filters, actorEmail })} />
      <Button className={`${secondaryButton} h-10 @lg:ml-auto`} onClick={onRefresh} disabled={busy}>
        <RotateCw size={16} aria-hidden className={busy ? 'animate-spin' : ''} />
        Refresh
      </Button>
    </div>
  )
}

/** Typing waits for a pause before it filters, so each keystroke does not send a request. */
function ActorFilter({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  const [draft, setDraft] = useState(value)
  const apply = useEffectEvent((next: string) => onChange(next))

  useEffect(() => {
    if (draft.trim() === value) return
    const timer = setTimeout(() => apply(draft.trim()), ACTOR_DEBOUNCE_MS)
    return () => clearTimeout(timer)
  }, [draft, value])

  return (
    <Field.Root className="grid min-w-0 flex-1 basis-56 gap-1.5">
      <Field.Label className={filterLabel}>Actor email</Field.Label>
      <Field.Control
        className={`${filterControl} placeholder:text-ink-3`}
        type="text"
        inputMode="email"
        autoComplete="off"
        spellCheck={false}
        placeholder="Any part, such as grace@"
        value={draft}
        onValueChange={setDraft}
      />
    </Field.Root>
  )
}

const COLUMNS = ['Time', 'Action', 'Actor', 'Target', 'Outcome', 'Trace ID']

type EventsProps = {
  page: Page<AuditEvent>
  filtered: boolean
  entrance: string
  sweepAfter: number | null
  busy: boolean
  onPage: (page: number) => void
}

function Events({ page, filtered, entrance, sweepAfter, busy, onPage }: EventsProps) {
  const now = useNow(30_000)
  if (page.data.length === 0) {
    return (
      <div className="animate-pop px-6 py-14 text-center">
        <h2 className="text-lg font-bold text-ink">{filtered ? 'No events match these filters' : 'No events yet'}</h2>
        <p className="mx-auto mt-1.5 max-w-[60ch] text-ink-2">
          {filtered
            ? 'Clear a filter or look for a different part of the email.'
            : 'Events appear here as people register, sign in and refresh, and as admins change accounts.'}
        </p>
      </div>
    )
  }
  const noun = page.total_data === 1 ? 'event' : 'events'
  const status = `Page ${page.page} of ${Math.max(page.total_page, 1)} · ${page.total_data} ${noun}`
  return (
    <>
      <div className="scroll-fade-x overflow-x-auto">
        <table className="w-full border-collapse text-sm tabular-nums" aria-label="Audit log" aria-busy={busy || undefined}>
          <thead>
            <tr>
              <th scope="col" className="h-11 w-12 border-b border-rule bg-mint">
                <span className="sr-only">Details</span>
              </th>
              {COLUMNS.map((column) => (
                <th key={column} scope="col" className="h-11 border-b border-rule bg-mint px-4 text-left text-xs font-bold whitespace-nowrap text-ink-3">
                  {column}
                </th>
              ))}
            </tr>
          </thead>
          {page.data.map((event, index) => (
            <EventRows
              key={event.id}
              event={event}
              now={now}
              entrance={entrance}
              index={index}
              fresh={sweepAfter !== null && event.id > sweepAfter}
            />
          ))}
        </table>
      </div>
      <div className="flex items-center justify-between gap-3 border-t border-rule px-5 py-3">
        <span className="overflow-hidden text-sm text-ink-3 tabular-nums">
          <span key={status} className="inline-block animate-roll">
            {status}
          </span>
        </span>
        <div className="flex gap-2">
          <Button className={secondaryButton} aria-label="Previous page" disabled={page.page <= 1} onClick={() => onPage(page.page - 1)}>
            <ChevronLeft size={16} aria-hidden />
            Previous
          </Button>
          <Button className={secondaryButton} aria-label="Next page" disabled={page.page >= page.total_page} onClick={() => onPage(page.page + 1)}>
            Next
            <ChevronRight size={16} aria-hidden />
          </Button>
        </div>
      </div>
    </>
  )
}

const cell = 'h-12 px-4 whitespace-nowrap'

type EventRowsProps = { event: AuditEvent; now: number; entrance: string; index: number; fresh: boolean }

/** One event is a tbody of two rows: the summary, and the details panel that grows open under it. */
function EventRows({ event, now, entrance, index, fresh }: EventRowsProps) {
  const name = `Details of event ${event.id}`
  return (
    <Collapsible.Root render={<tbody />} className="group/event border-b border-rule last:border-0">
      <tr
        data-fresh={fresh || undefined}
        className={`${entrance} stagger relative transition-colors hover:bg-mint group-has-[[data-panel-open]]/event:bg-mint`}
        style={{ '--i': index } as CSSProperties}
      >
        <td className="w-12 pl-3">
          {fresh && (
            <span aria-hidden className="pointer-events-none absolute inset-0 animate-sweep bg-linear-to-r from-transparent via-pear/50 to-transparent" />
          )}
          <Collapsible.Trigger
            aria-label={name}
            className="grid size-8 cursor-pointer place-items-center rounded-full text-g300 transition-[background-color,color] hover:bg-g100 hover:text-g900 data-[panel-open]:text-g900"
          >
            <ChevronDown size={16} aria-hidden className="transition-transform duration-300 ease-pop group-has-[[data-panel-open]]/event:rotate-180" />
          </Collapsible.Trigger>
        </td>
        <td className={`${cell} text-ink-2`}>
          <RelativeTime iso={event.occurred_at} now={now} />
        </td>
        <td className={cell}>
          <span title={event.action} className="inline-flex h-6 items-center rounded-full border border-g200 bg-white px-2.5 text-xs font-bold text-g700">
            {ACTION_LABELS[event.action]}
          </span>
        </td>
        <td className={cell}>
          <Actor event={event} />
        </td>
        <td className={cell}>{event.target_email ?? <Absent />}</td>
        <td className={cell}>
          <span
            data-outcome={event.outcome}
            className="inline-flex h-6 items-center gap-1.5 rounded-full px-2.5 font-display text-xs font-bold data-[outcome=failure]:bg-danger-wash data-[outcome=failure]:text-danger data-[outcome=success]:bg-g100 data-[outcome=success]:text-g700"
          >
            <span aria-hidden className="size-1.5 rounded-full bg-current" />
            {OUTCOME_LABELS[event.outcome]}
          </span>
        </td>
        <td className={cell}>{event.trace_id ? <code className="text-ink-2">{event.trace_id}</code> : <Absent />}</td>
      </tr>
      <tr>
        <td colSpan={COLUMNS.length + 1} className="p-0">
          <Collapsible.Panel
            role="region"
            aria-label={name}
            className="h-[var(--collapsible-panel-height)] overflow-hidden bg-mint transition-[height] duration-300 ease-pop data-[ending-style]:h-0 data-[starting-style]:h-0"
          >
            <EventDetails event={event} />
          </Collapsible.Panel>
        </td>
      </tr>
    </Collapsible.Root>
  )
}

function Actor({ event }: { event: AuditEvent }) {
  if (event.actor_email) return <>{event.actor_email}</>
  // Only the CLI grants permissions without a signed-in actor; any other missing actor is a token nobody could be matched to.
  return <span className="text-ink-3">{event.action === 'admin.permission_granted' ? 'CLI' : 'Unknown'}</span>
}

const Absent = () => <span className="text-ink-3">—</span>

function EventDetails({ event }: { event: AuditEvent }) {
  const rows: [string, string][] = [
    ...Object.entries(event.details).map(([key, value]): [string, string] => [DETAIL_LABELS[key] ?? key, value]),
    ['IP', event.ip ?? '—'],
    ['Actor ID', event.actor_user_id === null ? '—' : String(event.actor_user_id)],
    ['Target ID', event.target_user_id === null ? '—' : String(event.target_user_id)],
    ['Event ID', String(event.id)],
    ['Recorded at', event.occurred_at],
  ]
  return (
    <dl className="grid grid-cols-[max-content_minmax(0,1fr)] gap-x-8 gap-y-1.5 px-6 py-4 text-sm sm:pl-16">
      {rows.map(([term, value]) => (
        <div key={term} className="contents">
          <dt className="text-ink-3">{term}</dt>
          <dd className="break-words text-ink">{value}</dd>
        </div>
      ))}
    </dl>
  )
}

function EventsSkeleton() {
  return (
    <div className="animate-appear" aria-busy="true" aria-label="Loading events">
      <div className="h-11 border-b border-rule bg-mint" />
      {Array.from({ length: 6 }, (_, index) => (
        <div className="grid h-12 grid-cols-[24px_96px_1fr_112px_1fr] items-center gap-6 border-b border-rule px-5 last:border-0" key={index}>
          {['w-full', 'w-full', 'w-4/5', 'w-full', 'w-3/5'].map((width, bar) => (
            <ShimmerBar className={`h-2.5 ${width}`} key={bar} />
          ))}
        </div>
      ))}
    </div>
  )
}
