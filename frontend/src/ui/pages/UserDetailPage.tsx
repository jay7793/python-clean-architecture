import { Button } from '@base-ui/react/button'
import { ChevronLeft, Pencil } from 'lucide-react'
import { useId, useState } from 'react'
import { Link, Navigate, useLocation, useParams } from 'react-router'
import type { ApiError } from '../../domain/errors'
import type { UserOverview } from '../../domain/user'
import { AdminRequired } from '../components/AdminRequired'
import { ApiErrorNote } from '../components/ApiErrorNote'
import { Avatar } from '../components/Avatar'
import { card, secondaryButton } from '../components/classes'
import { DEMO_LOCKED_COPY } from '../components/errorCopy'
import { FieldList } from '../components/FieldList'
import { Notice } from '../components/Notice'
import { SkeletonBlock } from '../components/Placeholder'
import { ShimmerBar } from '../components/Shimmer'
import { Timestamp } from '../components/Timestamp'
import { useApiLoad } from '../components/useApiLoad'
import { RoleBadge, SessionStatus } from '../components/UserStatus'
import { useNow } from '../inspector/useNow'
import { usePageTitle } from '../layout/pageTitle'
import { useServices, useSession } from '../services'
import type { FromList, ListState } from './UsersPage'
import { DeleteUserDialog } from './DeleteUserDialog'
import { REVOKE_CONSEQUENCE, RevokeSessionDialog } from './RevokeSessionDialog'

export const USERS_LIST = '/users'

/** Router state for a user's page: the list page to return to and a notice after a create or an edit. */
export type UserPageState = Partial<FromList> & { notice?: string; created?: boolean }

export function UserDetailPage() {
  const id = Number(useParams().id)
  if (!Number.isInteger(id) || id < 1) return <Navigate to={USERS_LIST} replace />
  return <UserDetail key={id} id={id} />
}

function UserDetail({ id }: { id: number }) {
  const { session } = useServices()
  const load = useApiLoad(`users:${id}`, (signal) => session.getUserOverview(id, signal))
  // A revoke reads the user again; that answer replaces the first one without a second skeleton.
  const [revoked, setRevoked] = useState<UserOverview | null>(null)
  const user = revoked ?? (load.status === 'loaded' ? load.value : null)
  const state = useLocation().state as UserPageState | null
  const notice = revoked ? `Signed ${revoked.first_name} ${revoked.last_name} out. ${REVOKE_CONSEQUENCE}` : state?.notice
  const back = state?.list ?? USERS_LIST
  usePageTitle(user ? `${user.first_name} ${user.last_name}` : `User ${id}`)

  if (load.status === 'failed' && load.error.status === 404) return <NotFound id={id} error={load.error} back={back} />
  return (
    <div className="grid items-start gap-5 @3xl:grid-cols-12">
      <BackLink to={back} state={state?.notice ? { recent: id, created: state.created } : undefined} className="@3xl:col-span-12" />
      {notice && (
        <Notice key={notice} tone="success" className="@3xl:col-span-12">
          {notice}
        </Notice>
      )}
      <div className="grid gap-5 @3xl:col-span-7">
        {load.status === 'loading' && <CardSkeleton />}
        {user && <UserCard user={user} back={back} flipped={revoked !== null} onRevoked={setRevoked} />}
        {load.status === 'forbidden' && (
          <div className={`${card} overflow-hidden`}>
            <AdminRequired error={load.error} />
          </div>
        )}
        {load.status === 'failed' && (
          <div className={`${card} p-5`}>
            <ApiErrorNote error={load.error} />
          </div>
        )}
      </div>
      <ActivityPlaceholder />
    </div>
  )
}

type BackLinkProps = { to: string; state?: UserPageState | ListState; label?: string; className?: string }

export function BackLink({ to, state, label = 'Back to Users', className = '' }: BackLinkProps) {
  return (
    <Link
      to={to}
      state={state}
      className={`inline-flex items-center gap-1 justify-self-start text-sm font-bold text-g700 no-underline hover:underline ${className}`}
    >
      <ChevronLeft size={16} aria-hidden />
      {label}
    </Link>
  )
}

type UserCardProps = { user: UserOverview; back: string; flipped: boolean; onRevoked: (fresh: UserOverview) => void }

function UserCard({ user, back, flipped, onRevoked }: UserCardProps) {
  const titleId = useId()
  const lockedId = useId()
  const lockedBy = user.protected ? lockedId : undefined
  const now = useNow(30_000)
  const current = useSession()
  const self = current.status === 'authenticated' && current.user.id === user.id
  const editState: UserPageState = { list: back }
  return (
    <section aria-labelledby={titleId} className={`${card} animate-rise`}>
      <header className="flex items-center gap-4 border-b border-rule px-6 py-5 sm:px-8">
        <Avatar user={user} size="lg" />
        <div className="min-w-0">
          <h2 id={titleId} className="truncate text-xl leading-tight font-bold text-ink">
            {user.first_name} {user.last_name}
          </h2>
          <p className="mt-1 text-sm text-pretty text-ink-3">
            As the API returned it from <code>GET /api/v1/admin/users/{user.id}/overview</code>.
          </p>
        </div>
      </header>
      <div className="px-6 py-2 sm:px-8">
        <FieldList
          rows={[
            ['Email', user.email],
            ['ID', String(user.id)],
            ['Role', <RoleBadge role={user.role} />],
            [
              'Session',
              <span key={String(user.session.active)} className={flipped ? 'inline-block animate-[appear_320ms_var(--ease-out)_both]' : undefined}>
                <SessionStatus session={user.session} now={now} />
              </span>,
            ],
            ['Created', <Timestamp iso={user.created_at} />],
            ['Updated', <Timestamp iso={user.updated_at} />],
          ]}
        />
      </div>
      <footer className="flex flex-wrap items-center gap-2 border-t border-rule px-6 py-4 sm:px-8">
        {lockedBy ? (
          <Button className={secondaryButton} disabled aria-describedby={lockedBy}>
            <Pencil size={15} aria-hidden />
            Edit
          </Button>
        ) : (
          <Link to={`/users/${user.id}/edit`} state={editState} className={`${secondaryButton} no-underline`}>
            <Pencil size={15} aria-hidden />
            Edit
          </Link>
        )}
        {user.session.active && !self && <RevokeSessionDialog user={user} onRevoked={onRevoked} lockedBy={lockedBy} />}
        <DeleteUserDialog user={user} back={back} lockedBy={lockedBy} />
        {lockedBy && (
          <p id={lockedBy} className="basis-full text-sm text-pretty text-ink-3">
            {DEMO_LOCKED_COPY}
          </p>
        )}
      </footer>
    </section>
  )
}

export function CardSkeleton() {
  return (
    <div className={`${card} animate-appear`} aria-busy="true" aria-label="Loading user">
      <div className="flex items-center gap-4 border-b border-rule px-6 py-5 sm:px-8">
        <ShimmerBar className="size-14 flex-none rounded-sm" />
        <div className="grid flex-1 gap-2.5">
          <ShimmerBar className="h-4 w-2/5" />
          <ShimmerBar className="h-2.5 w-3/5" />
        </div>
      </div>
      <div className="px-6 py-2 sm:px-8">
        {['w-3/5', 'w-1/6', 'w-2/5', 'w-2/5'].map((width, row) => (
          <div className="grid h-[54px] grid-cols-[150px_1fr] items-center gap-4 border-b border-rule last:border-0 max-sm:grid-cols-[80px_1fr]" key={row}>
            <ShimmerBar className="h-2.5 w-16" />
            <ShimmerBar className={`h-2.5 ${width}`} />
          </div>
        ))}
      </div>
    </div>
  )
}

function ActivityPlaceholder() {
  return (
    <SkeletonBlock className={`${card} animate-rise p-6 [animation-delay:60ms] @3xl:col-span-5`}>
      <div className="h-3 w-2/5 rounded-full bg-g100" />
      <ol className="mt-6 border-l-2 border-rule pl-5">
        {['w-4/5', 'w-3/5', 'w-2/3', 'w-1/2'].map((width) => (
          <li className="relative pb-6 last:pb-0" key={width}>
            <span className="absolute top-0.5 -left-[27px] size-3 rounded-full bg-g200 ring-4 ring-white" />
            <div className={`h-2.5 rounded-full bg-g100 ${width}`} />
            <div className="mt-2 h-2 w-1/3 rounded-full bg-rule" />
          </li>
        ))}
      </ol>
    </SkeletonBlock>
  )
}

export function NotFound({ id, error, back }: { id: number; error: ApiError; back: string }) {
  const titleId = useId()
  return (
    <section aria-labelledby={titleId} className={`${card} max-w-[640px] animate-pop p-6 sm:p-8`}>
      <h2 id={titleId} className="text-lg font-bold text-ink">
        User not found
      </h2>
      <p className="mt-1.5 max-w-[60ch] text-ink-2">
        No user has ID {id}. The account may have been removed, or the link has a typo.
      </p>
      <p className="mt-3 text-sm text-ink-3 tabular-nums">
        HTTP {error.status} · trace_id <code>{error.traceId}</code> · {error.message}
      </p>
      <Link to={back} className={`${secondaryButton} mt-5 no-underline`}>
        <ChevronLeft size={16} aria-hidden />
        Back to Users
      </Link>
    </section>
  )
}
