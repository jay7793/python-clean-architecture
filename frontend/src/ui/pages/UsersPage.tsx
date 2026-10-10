import { Button } from '@base-ui/react/button'
import { ChevronLeft, ChevronRight, Plus } from 'lucide-react'
import { useState, type CSSProperties, type ReactNode } from 'react'
import { Link, Navigate, useLocation, useSearchParams } from 'react-router'
import { USERS_PAGE_SIZE, type Page, type UserOverview } from '../../domain/user'
import { ApiErrorNote } from '../components/ApiErrorNote'
import { card, compactPrimaryButton, secondaryButton } from '../components/classes'
import { AdminRequired } from '../components/AdminRequired'
import { Notice } from '../components/Notice'
import { ShimmerBar } from '../components/Shimmer'
import { RelativeTime } from '../components/RelativeTime'
import { Timestamp } from '../components/Timestamp'
import { useApiLoad, type ApiLoad } from '../components/useApiLoad'
import { RoleBadge, SessionStatus } from '../components/UserStatus'
import { useNow } from '../inspector/useNow'
import { useServices } from '../services'

/**
 * Router state for the list: a notice, the row just deleted, which strikes out where it stood, and the id of a
 * user just created or edited, whose row is marked as it slots in. A created user has the highest id, so their
 * row is on the last page.
 */
export type ListState = { notice?: string; deleted?: UserOverview; recent?: number; created?: boolean }

export function UsersPage() {
  const state = useLocation().state as ListState | null
  return (
    <div className="grid items-start gap-5">
      {state?.notice && <Notice tone="success">{state.notice}</Notice>}
      <div className={`${card} animate-rise overflow-hidden`}>
        <UsersTable state={state} />
      </div>
    </div>
  )
}

/** Only an admin can create users, and only a loaded list proves the caller is one. */
function Intro({ canCreate }: { canCreate: boolean }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3 border-b border-rule px-5 py-4 sm:px-6">
      <p className="max-w-[72ch] text-sm text-pretty text-ink-3">
        Rows from <code>GET /api/v1/admin/users</code>. Only admins can read them. Open a user to edit them, delete them or sign
        them out.
      </p>
      {canCreate && (
        <Link to="/users/new" className={`${compactPrimaryButton} animate-pop no-underline`}>
          <Plus size={16} aria-hidden />
          New user
        </Link>
      )}
    </div>
  )
}

/** Rows of a new page slide in from the side the visitor paged towards; the first page drops in from above. */
const ROW_ENTRANCE = {
  first: 'animate-slot-in',
  next: 'animate-page-next',
  back: 'animate-page-back',
}

/** The page in ?page= and the side the rows enter from, which follows the direction the visitor paged. */
function usePaging() {
  const [params, setParams] = useSearchParams()
  const page = pageParam(params.get('page'))
  const [direction, setDirection] = useState<keyof typeof ROW_ENTRANCE>('first')
  const goTo = (next: number) => {
    setDirection(next > page ? 'next' : 'back')
    setParams(next === 1 ? {} : { page: String(next) })
  }
  return { page, entrance: ROW_ENTRANCE[direction], goTo }
}

function UsersTable({ state }: { state: ListState | null }) {
  const { page, entrance, goTo } = usePaging()
  const { session } = useServices()
  const load = useApiLoad(`users:${page}`, (signal) => session.listAdminUsers(page, USERS_PAGE_SIZE, signal))
  const now = useNow(30_000)
  // The tour frames New user and the table together, and reads a loaded list as proof the account is an admin.
  return (
    <div data-tour={load.status === 'loaded' ? 'users-list' : undefined}>
      <Intro canCreate={load.status === 'loaded'} />
      <Loaded load={load}>
        {(data) => {
          const target = settledPage(data, state)
          if (target !== data.page) return <Navigate to={pageHref(target)} replace state={state} />
          return (
            <Rows data={data} now={now} entrance={entrance} deleted={state?.deleted} recent={state?.recent} onPage={goTo} />
          )
        }}
      </Loaded>
    </div>
  )
}

function Loaded<T>({ load, children }: { load: ApiLoad<T>; children: (value: T) => ReactNode }) {
  switch (load.status) {
    case 'loading':
      return <TableSkeleton />
    case 'forbidden':
      return <AdminRequired error={load.error} />
    case 'failed':
      return (
        <div className="p-5">
          <ApiErrorNote error={load.error} />
        </div>
      )
    case 'loaded':
      return children(load.value)
  }
}

/** A created user lands on the last page; a page past the end (its last row was deleted) falls back to the last one. */
function settledPage(data: Page<unknown>, state: ListState | null): number {
  const last = Math.max(data.total_page, 1)
  return state?.created ? last : Math.min(data.page, last)
}

const pageHref = (page: number) => (page === 1 ? '/users' : `/users?page=${page}`)

function pageParam(value: string | null): number {
  const page = Number(value)
  return Number.isInteger(page) && page > 1 ? page : 1
}

export type FromList = { list: string }

/** The name cell opens the user: a real link whose ::after stretches over the whole row. */
function UserLink({ user }: { user: UserOverview }) {
  const { pathname, search } = useLocation()
  const name = `${user.first_name} ${user.last_name}`
  const state: FromList = { list: pathname + search }
  return (
    <Link
      to={`/users/${user.id}`}
      state={state}
      aria-label={`View ${name}`}
      className="font-bold text-ink no-underline after:absolute after:inset-0 after:rounded-sm after:-outline-offset-3 group-hover/row:text-g700 group-hover/row:underline focus-visible:outline-none focus-visible:after:outline-3 focus-visible:after:outline-g600"
    >
      {name}
    </Link>
  )
}

/** How a cell draws its row. A ghost row is the struck-out copy of a deleted user, so it must hold nothing to click. */
type Column = { label: string; cell: (row: UserOverview, at: { now: number; ghost: boolean }) => ReactNode }

const muted = (text: string) => <span className="text-ink-3">{text}</span>

/** Who, what and whether they are signed in come first, so a narrow screen sees them before it scrolls. */
const USER_COLUMNS: Column[] = [
  { label: 'Name', cell: (user, { ghost }) => (ghost ? `${user.first_name} ${user.last_name}` : <UserLink user={user} />) },
  { label: 'Role', cell: (user) => <RoleBadge role={user.role} className="animate-badge stagger [animation-delay:calc(min(var(--i,0),8)*40ms+120ms)]" /> },
  { label: 'Session', cell: (user, { now }) => <SessionStatus session={user.session} now={now} /> },
  {
    label: 'Last sign-in',
    cell: (user, { now }) => (user.last_sign_in_at ? <RelativeTime iso={user.last_sign_in_at} now={now} /> : muted('No sign-in recorded')),
  },
  { label: 'Email', cell: (user) => user.email },
  { label: 'Created', cell: (user) => <Timestamp iso={user.created_at} /> },
]

type RowsProps = {
  data: Page<UserOverview>
  now: number
  entrance: string
  deleted?: UserOverview
  recent?: number
  onPage: (page: number) => void
}

function Rows({ data, now, entrance, deleted, recent, onPage }: RowsProps) {
  const [ghostGone, setGhostGone] = useState(false)
  if (data.data.length === 0) {
    return (
      <div className="animate-pop px-6 py-14 text-center">
        <h2 className="text-lg font-bold text-ink">No users yet</h2>
        <p className="mx-auto mt-1.5 max-w-[60ch] text-ink-2">Accounts appear here after they register.</p>
      </div>
    )
  }
  const live = { now, ghost: false }
  const tableRows = data.data.map((row, index) => (
    <tr
      key={row.id}
      className={`${entrance} stagger group/row relative isolate cursor-pointer border-b border-rule transition-colors last:border-0 hover:bg-mint has-[a:focus-visible]:bg-mint`}
      style={{ '--i': index } as CSSProperties}
      data-recent={(recent !== undefined && row.id === recent) || undefined}
    >
      {USER_COLUMNS.map((column, cell) => (
        <td key={column.label} className="h-12 px-4 whitespace-nowrap">
          {cell === 0 && recent !== undefined && row.id === recent && <span aria-hidden className="pointer-events-none absolute inset-0 -z-10 animate-lock-brief" />}
          {column.cell(row, live)}
        </td>
      ))}
    </tr>
  ))
  const ghostAt = deleted && !ghostGone ? ghostIndex(data, deleted.id) : null
  if (deleted && ghostAt !== null) {
    tableRows.splice(ghostAt, 0, <GhostRow key="deleted" row={deleted} now={now} onGone={() => setGhostGone(true)} />)
  }
  const status = `Page ${data.page} of ${Math.max(data.total_page, 1)} · ${data.total_data} rows`
  return (
    <>
      <div className="scroll-fade-x overflow-x-auto">
        <table className="w-full border-collapse text-sm tabular-nums" aria-label="Users">
          <thead>
            <tr>
              {USER_COLUMNS.map((column) => (
                <th
                  key={column.label}
                  scope="col"
                  className="h-11 border-b border-rule bg-mint px-4 text-left text-xs font-bold whitespace-nowrap text-ink-3"
                >
                  {column.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>{tableRows}</tbody>
        </table>
      </div>
      <div className="flex items-center justify-between gap-3 border-t border-rule px-5 py-3">
        <span className="overflow-hidden text-sm text-ink-3 tabular-nums">
          <span key={status} className="inline-block animate-roll">
            {status}
          </span>
        </span>
        <div className="flex gap-2">
          <Button className={secondaryButton} aria-label="Previous page" disabled={data.page <= 1} onClick={() => onPage(data.page - 1)}>
            <ChevronLeft size={16} aria-hidden />
            Previous
          </Button>
          <Button className={secondaryButton} aria-label="Next page" disabled={data.page >= data.total_page} onClick={() => onPage(data.page + 1)}>
            Next
            <ChevronRight size={16} aria-hidden />
          </Button>
        </div>
      </div>
    </>
  )
}

/** Where the deleted row stood on this page (rows are ordered by id), or null when it belonged to another page. */
function ghostIndex(data: Page<UserOverview>, id: number): number | null {
  const at = data.data.findIndex((row) => row.id > id)
  if (at === -1) return data.page >= data.total_page ? data.data.length : null
  return at > 0 || data.page === 1 ? at : null
}

type GhostRowProps = { row: UserOverview; now: number; onGone: () => void }

/** The row an admin just deleted: drawn once where it stood, struck through, then removed. */
function GhostRow({ row, now, onGone }: GhostRowProps) {
  return (
    <tr aria-hidden className="border-b border-rule bg-danger-wash/50 last:border-0" onAnimationEnd={onGone}>
      {USER_COLUMNS.map((column) => (
        <td key={column.label} className="h-12 px-4 whitespace-nowrap text-ink-3">
          <span className="inline-block animate-strike-out [animation-delay:240ms]">{column.cell(row, { now, ghost: true })}</span>
        </td>
      ))}
    </tr>
  )
}

function TableSkeleton() {
  return (
    <div className="animate-appear" aria-busy="true" aria-label="Loading rows">
      <div className="h-11 border-b border-rule bg-mint" />
      {Array.from({ length: 5 }, (_, index) => (
        <div className="grid h-12 grid-cols-[48px_1fr_1fr] items-center gap-6 border-b border-rule px-5 last:border-0" key={index}>
          {['w-full', 'w-full', 'w-3/5'].map((width, bar) => (
            <ShimmerBar className={`h-2.5 ${width}`} key={bar} />
          ))}
        </div>
      ))}
    </div>
  )
}
