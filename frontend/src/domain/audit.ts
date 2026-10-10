export const AUDIT_ACTIONS = [
  'user.registered',
  'auth.login',
  'auth.login_failed',
  'auth.refresh',
  'auth.refresh_rejected',
  'auth.logout',
  'admin.user_created',
  'admin.user_updated',
  'admin.user_deleted',
  'admin.session_revoked',
  'admin.permission_granted',
] as const
export type AuditAction = (typeof AUDIT_ACTIONS)[number]

export const OUTCOMES = ['success', 'failure'] as const
export type Outcome = (typeof OUTCOMES)[number]

/** One recorded event. The emails are snapshots, so they outlive a deleted user; details never hold secrets. */
export type AuditEvent = {
  id: number
  occurred_at: string
  action: AuditAction
  outcome: Outcome
  actor_user_id: number | null
  actor_email: string | null
  target_user_id: number | null
  target_email: string | null
  trace_id: string | null
  ip: string | null
  details: Record<string, string>
}

/** A missing filter matches every event. actorEmail matches any part of the email, ignoring case. */
export type AuditFilters = { action?: AuditAction; outcome?: Outcome; actorEmail?: string }
