import { NO_RESPONSE, type Exchange } from '../../domain/exchange'
import { errorCopy } from '../components/errorCopy'

/** The one table of what an HTTP status means to someone reading the inspector. */
const STATUS_MEANING: Record<number, string> = {
  200: 'OK',
  201: 'Created',
  204: 'No content',
  400: 'Wrong credentials',
  401: 'Token rejected',
  403: 'Admin only',
  404: 'Not found',
  409: 'Conflict',
  422: 'Invalid input',
}

/** "401 Token rejected", "Waiting" while in flight, "No response" when the network call failed. */
export function statusLabel(status: number | undefined): string {
  if (status === undefined) return 'Waiting'
  if (status === NO_RESPONSE) return 'No response'
  const meaning = STATUS_MEANING[status]
  return meaning ? `${status} ${meaning}` : String(status)
}

const PREFIX = '/api/v1'

/** The path without the API prefix, and its query string apart so it can be shown quieter. */
export function shortPath(path: string): { route: string; query: string } {
  const bare = path.startsWith(PREFIX) ? path.slice(PREFIX.length) : path
  const at = bare.indexOf('?')
  return at === -1 ? { route: bare, query: '' } : { route: bare.slice(0, at), query: bare.slice(at) }
}

/** The full request line, plus the product copy for its trace id when there is one. */
export function requestTitle({ method, path, status, traceId }: Exchange): string {
  const copy = status !== undefined && traceId ? errorCopy({ status, traceId }) : undefined
  return copy ? `${method} ${path}\n${copy}` : `${method} ${path}`
}
