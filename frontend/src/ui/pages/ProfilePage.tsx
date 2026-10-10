import type { ReactNode } from 'react'
import { Avatar } from '../components/Avatar'
import { card } from '../components/classes'
import { FieldList } from '../components/FieldList'
import { SkeletonBlock, SkeletonStat } from '../components/Placeholder'
import { Timestamp } from '../components/Timestamp'
import { useSession } from '../services'

/** Column heights of the placeholder chart, as a share of its plot area. They draw a shape, not data. */
const CHART_COLUMNS = [52, 60, 56, 64, 58, 62, 54, 66, 60, 64]

export function ProfilePage() {
  const session = useSession()
  if (session.status !== 'authenticated') return null
  const { user } = session
  const rows: [string, ReactNode][] = [
    ['Email', user.email],
    ['First name', user.first_name],
    ['Last name', user.last_name],
    ['ID', String(user.id)],
    ['Created', <Timestamp iso={user.created_at} />],
    ['Updated', <Timestamp iso={user.updated_at} />],
  ]
  return (
    <div className="grid gap-5 @3xl:grid-cols-12">
      <section aria-labelledby="profile-name" className={`${card} animate-rise @3xl:col-span-7`}>
        <header className="flex items-center gap-4 border-b border-rule px-6 py-5 sm:px-8">
          <Avatar user={user} size="lg" />
          <div className="min-w-0">
            <h2 id="profile-name" className="truncate text-xl leading-tight font-bold text-ink">
              {user.first_name} {user.last_name}
            </h2>
            <p className="mt-1 text-sm text-pretty text-ink-3">
              Your account as the API returned it. A reload restores it with <code>GET /api/v1/users/profile</code>.
            </p>
          </div>
        </header>
        <div role="group" aria-label="Account" className="px-6 py-2 sm:px-8">
          <FieldList rows={rows} />
        </div>
      </section>
      <SkeletonBlock className={`${card} flex animate-rise flex-col p-6 [animation-delay:60ms] @max-3xl:min-h-72 @3xl:col-span-5`}>
        <div className="h-3 w-2/5 rounded-full bg-g100" />
        <div className="mt-2.5 h-2 w-3/5 rounded-full bg-g100" />
        <div className="mt-8 flex flex-1 items-end gap-2 border-b border-rule">
          {CHART_COLUMNS.map((height, index) => (
            <div className="flex-1 rounded-t-[6px] bg-g100" style={{ height: `${height}%` }} key={index} />
          ))}
        </div>
        <div className="mt-3 flex justify-between">
          {[0, 1, 2, 3].map((tick) => (
            <div className="h-2 w-8 rounded-full bg-g100" key={tick} />
          ))}
        </div>
      </SkeletonBlock>
      <div className="grid animate-rise grid-cols-3 gap-3 [animation-delay:120ms] @2xl:gap-5 @3xl:col-span-12">
        <SkeletonStat />
        <SkeletonStat />
        <SkeletonStat />
      </div>
    </div>
  )
}
