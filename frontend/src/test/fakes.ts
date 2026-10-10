import type { AuthApi, ExchangeRef, TokenStore } from '../application/ports'
import type { TokenPair, User, UserOverview } from '../domain/user'

export const ada: User = {
  id: 1,
  email: 'ada@example.com',
  first_name: 'Ada',
  last_name: 'Lovelace',
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
}
/** A user as the admin list returns them: by default a member who never signed in. */
export function overviewOf(user: Pick<User, 'id' | 'email'> & Partial<User>, fields: Partial<UserOverview> = {}): UserOverview {
  return {
    first_name: 'User',
    last_name: String(user.id),
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    ...user,
    role: 'member',
    session: { active: false, last_active_at: null },
    last_sign_in_at: null,
    protected: false,
    ...fields,
  }
}

export const firstPair: TokenPair = { access: 'access-1', refresh: 'refresh-1' }

export type Call = { op: keyof AuthApi; ref: ExchangeRef; arg?: unknown }

export function fakeApi(impl: Partial<AuthApi>) {
  const calls: Call[] = []
  const unexpected = (op: keyof AuthApi) => () => Promise.reject(new Error(`unexpected ${op}`))
  // Like fetch, a read whose signal aborts in the same task is never sent.
  const track =
    <A extends unknown[], R>(op: keyof AuthApi, fn: ((ref: ExchangeRef, ...args: A) => Promise<R>) | undefined) =>
    async (ref: ExchangeRef, ...args: A): Promise<R> => {
      const signal = args.find((arg) => arg instanceof AbortSignal)
      if (signal) await Promise.resolve()
      signal?.throwIfAborted()
      calls.push({ op, ref, arg: args[0] })
      return (fn ?? (unexpected(op) as () => Promise<R>))(ref, ...args)
    }
  const api: AuthApi = {
    register: track('register', impl.register),
    login: track('login', impl.login),
    refresh: track('refresh', impl.refresh),
    logout: track('logout', impl.logout),
    profile: track('profile', impl.profile),
    createUser: track('createUser', impl.createUser),
    getAdminUser: track('getAdminUser', impl.getAdminUser),
    updateUser: track('updateUser', impl.updateUser),
    deleteUser: track('deleteUser', impl.deleteUser),
    listAuditLogs: track('listAuditLogs', impl.listAuditLogs),
    listAdminUsers: track('listAdminUsers', impl.listAdminUsers),
    getUserOverview: track('getUserOverview', impl.getUserOverview),
    revokeUserSession: track('revokeUserSession', impl.revokeUserSession),
  }
  return { api, calls }
}

/** A token store shared by tabs: `fromOtherTab` writes as another tab would and notifies like a storage event. */
export type MemoryStore = TokenStore & { current: TokenPair | null; fromOtherTab(tokens: TokenPair | null): void }

export function memoryStore(initial: TokenPair | null = null): MemoryStore {
  const listeners = new Set<(tokens: TokenPair | null) => void>()
  const store: MemoryStore = {
    current: initial,
    load: () => store.current,
    save(tokens) {
      store.current = tokens
    },
    clear() {
      store.current = null
    },
    subscribe(listener) {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    fromOtherTab(tokens) {
      store.current = tokens
      for (const listener of listeners) listener(tokens)
    },
  }
  return store
}
