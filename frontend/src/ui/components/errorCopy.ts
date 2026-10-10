import type { ApiError } from '../../domain/errors'

export const SELF_DELETE_COPY = "You can't delete your own account. Another admin can."
const SELF_REVOKE_COPY = "You can't revoke your own session. Use Sign out instead."
export const SELF_DEMOTE_COPY = "You can't remove your own admin access. Another admin can."
export const DEMO_LOCKED_COPY = 'Demo account: editing, deleting and revoking are turned off so the demo keeps working.'

// users-001 is both invalid registration input (422) and a taken email (409), so a key may carry the status.
const COPY: Record<string, string> = {
  'users-002': 'Email or password is incorrect. Check both and try again.',
  '409 users-001': 'This email already has an account. Use a different email.',
  'users-005': 'This user no longer exists. Someone may have deleted it already.',
  'admin-001': SELF_DELETE_COPY,
  'admin-002': SELF_DEMOTE_COPY,
  'admin-003': SELF_REVOKE_COPY,
  'admin-004': DEMO_LOCKED_COPY,
}

export function errorCopy({ status, traceId }: Pick<ApiError, 'status' | 'traceId'>): string | undefined {
  return COPY[`${status} ${traceId}`] ?? COPY[traceId]
}
