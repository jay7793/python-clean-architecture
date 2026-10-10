import type { Role, UserSession } from '../../domain/user'
import { RelativeTime } from './RelativeTime'

const ROLES: Record<Role, { label: string; className: string }> = {
  admin: { label: 'Admin', className: 'bg-pear-100 text-g900 ring-pear' },
  member: { label: 'Member', className: 'bg-white text-ink-2 ring-rule' },
}

export function RoleBadge({ role, className = '' }: { role: Role; className?: string }) {
  const { label, className: tone } = ROLES[role]
  return <span className={`inline-flex h-6 items-center rounded-full px-2.5 font-display text-xs font-bold ring-1 ring-inset ${tone} ${className}`}>{label}</span>
}

export function SessionStatus({ session, now }: { session: UserSession; now: number }) {
  if (!session.active) return <span className="text-ink-3">Signed out</span>
  return (
    <span className="inline-flex items-center gap-1.5">
      <span aria-hidden className="size-2 flex-none rounded-full bg-g600" />
      <span className="font-bold text-g700">Active</span>
      <span className="text-ink-3">
        {' · '}
        <RelativeTime iso={session.last_active_at} now={now} />
      </span>
    </span>
  )
}
