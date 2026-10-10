import type { AuditAction, Outcome } from '../../domain/audit'

/** The one table of action names: the badges, the Action filter and its options all read it. */
export const ACTION_LABELS: Record<AuditAction, string> = {
  'user.registered': 'Registered',
  'auth.login': 'Signed in',
  'auth.login_failed': 'Sign-in failed',
  'auth.refresh': 'Token refreshed',
  'auth.refresh_rejected': 'Refresh rejected',
  'auth.logout': 'Signed out',
  'admin.user_created': 'User created',
  'admin.user_updated': 'User edited',
  'admin.user_deleted': 'User deleted',
  'admin.session_revoked': 'Session revoked',
  'admin.permission_granted': 'Permission granted',
}

export const OUTCOME_LABELS: Record<Outcome, string> = { success: 'Success', failure: 'Failure' }

/** Detail keys the backend writes. A key missing here shows as it is. */
export const DETAIL_LABELS: Record<string, string> = {
  changed: 'Changed fields',
  is_admin: 'Admin',
  permission: 'Permission',
}
