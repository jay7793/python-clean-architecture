import createClient, { type Middleware } from 'openapi-fetch'
import type { AuthApi, ExchangeRecorder, ExchangeRef } from '../../application/ports'
import { ApiError } from '../../domain/errors'
import { NO_RESPONSE } from '../../domain/exchange'
import type { UserOverview } from '../../domain/user'
import type { components, paths } from './schema'

/** An empty `baseUrl` means the API shares the page's origin, as in the single production image. */
type Options = { baseUrl: string; recorder: ExchangeRecorder; fetch?: typeof globalThis.fetch }

async function envelope(response: Response): Promise<ApiError> {
  const body: unknown = await response.json().catch(() => null)
  const { trace_id, message } = (typeof body === 'object' && body !== null ? body : {}) as Record<string, unknown>
  return typeof trace_id === 'string' && typeof message === 'string'
    ? new ApiError(response.status, trace_id, message)
    : new ApiError(response.status, 'unknown', `The API answered ${response.status} without an error envelope.`)
}

function overviewOf({ session, ...user }: components['schemas']['AdminUserOverview']): UserOverview {
  const { last_active_at } = session
  return { ...user, session: session.active && last_active_at !== null ? { active: true, last_active_at } : { active: false, last_active_at } }
}

/** A successful answer's body. Failures never get here: the exchange middleware throws them as ApiError. */
async function bodyOf<T>(call: Promise<{ data?: T; response: Response }>): Promise<T> {
  const { data, response } = await call
  if (data === undefined) throw new ApiError(response.status, 'unknown', `The API answered ${response.status} without a body.`)
  return data
}

export function createHttpAuthApi({ baseUrl: configured, recorder, fetch }: Options): AuthApi {
  const baseUrl = configured || globalThis.location.origin
  const client = createClient<paths>({ baseUrl, ...(fetch && { fetch }) })

  /** Records the call under `ref` from the real Request and Response, and turns every failure into an ApiError. */
  const exchangeAs = (ref: ExchangeRef): Middleware => ({
    onRequest({ request }) {
      const { pathname, search } = new URL(request.url)
      recorder.open({ ...ref, method: request.method, path: pathname + search })
    },
    async onResponse({ response }) {
      if (response.ok) return void recorder.close(ref.id, response.status)
      const failure = await envelope(response)
      recorder.close(ref.id, response.status, failure.traceId)
      throw failure
    },
    onError({ request }) {
      // The caller cancelled; the AbortError goes back to it unchanged.
      if (request.signal.aborted) return void recorder.discard(ref.id)
      recorder.close(ref.id, NO_RESPONSE)
      return new ApiError(NO_RESPONSE, 'network', `Could not reach the API at ${baseUrl}. Is the backend running?`)
    },
  })
  const as = (ref: ExchangeRef) => ({ middleware: [exchangeAs(ref)] })
  const authorized = (ref: ExchangeRef, accessToken: string, signal?: AbortSignal) => ({
    ...as(ref),
    headers: { Authorization: `Bearer ${accessToken}` },
    ...(signal && { signal }),
  })
  const user = (user_id: number) => ({ path: { user_id } })

  return {
    register: (ref, body) => bodyOf(client.POST('/api/v1/users/register', { ...as(ref), body })),
    login: (ref, body) => bodyOf(client.POST('/api/v1/users/login', { ...as(ref), body })),
    refresh: (ref, refresh_token) => bodyOf(client.POST('/api/v1/users/refresh-token', { ...as(ref), body: { refresh_token } })),
    logout: async (ref, refresh_token) => {
      await client.POST('/api/v1/users/logout', { ...as(ref), body: { refresh_token } })
    },
    profile: (ref, accessToken, signal) => bodyOf(client.GET('/api/v1/users/profile', authorized(ref, accessToken, signal))),
    createUser: (ref, accessToken, body) => bodyOf(client.POST('/api/v1/admin/users', { ...authorized(ref, accessToken), body })),
    getAdminUser: (ref, accessToken, id, signal) =>
      bodyOf(client.GET('/api/v1/admin/users/{user_id}', { ...authorized(ref, accessToken, signal), params: user(id) })),
    updateUser: (ref, accessToken, id, body) =>
      bodyOf(client.PATCH('/api/v1/admin/users/{user_id}', { ...authorized(ref, accessToken), params: user(id), body })),
    deleteUser: async (ref, accessToken, id) => {
      await client.DELETE('/api/v1/admin/users/{user_id}', { ...authorized(ref, accessToken), params: user(id) })
    },
    listAdminUsers: async (ref, accessToken, page, pageSize, signal) => {
      const query = { _page: page, _pageSize: pageSize }
      const found = await bodyOf(client.GET('/api/v1/admin/users', { ...authorized(ref, accessToken, signal), params: { query } }))
      return { ...found, data: found.data.map(overviewOf) }
    },
    getUserOverview: async (ref, accessToken, id, signal) =>
      overviewOf(
        await bodyOf(client.GET('/api/v1/admin/users/{user_id}/overview', { ...authorized(ref, accessToken, signal), params: user(id) })),
      ),
    revokeUserSession: async (ref, accessToken, id) => {
      await client.DELETE('/api/v1/admin/users/{user_id}/session', { ...authorized(ref, accessToken), params: user(id) })
    },
    listAuditLogs: (ref, accessToken, { action, outcome, actorEmail }, page, pageSize, signal) => {
      const query = {
        _page: page,
        _pageSize: pageSize,
        ...(action && { action }),
        ...(outcome && { outcome }),
        ...(actorEmail && { actor_email: actorEmail }),
      }
      return bodyOf(client.GET('/api/v1/admin/audit-logs', { ...authorized(ref, accessToken, signal), params: { query } }))
    },
  }
}
