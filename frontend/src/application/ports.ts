import type { AuditEvent, AuditFilters } from '../domain/audit'
import type { Exchange } from '../domain/exchange'
import type {
  AccountChanges,
  AdminUser,
  Credentials,
  LoginResult,
  NewAccount,
  Page,
  Registration,
  TokenPair,
  User,
  UserOverview,
} from '../domain/user'

/** Identifies the exchange an adapter call records, so the application decides how calls nest. */
export type ExchangeRef = Pick<Exchange, 'id' | 'kind' | 'parentId' | 'repeats'>

/** Reads take an AbortSignal so a page that goes away cancels them; writes always finish. */
export interface AuthApi {
  register(ref: ExchangeRef, input: Registration): Promise<User>
  login(ref: ExchangeRef, credentials: Credentials): Promise<LoginResult>
  refresh(ref: ExchangeRef, refreshToken: string): Promise<LoginResult>
  logout(ref: ExchangeRef, refreshToken: string): Promise<void>
  profile(ref: ExchangeRef, accessToken: string, signal?: AbortSignal): Promise<User>
  createUser(ref: ExchangeRef, accessToken: string, input: NewAccount): Promise<AdminUser>
  getAdminUser(ref: ExchangeRef, accessToken: string, id: number, signal?: AbortSignal): Promise<AdminUser>
  updateUser(ref: ExchangeRef, accessToken: string, id: number, changes: AccountChanges): Promise<AdminUser>
  deleteUser(ref: ExchangeRef, accessToken: string, id: number): Promise<void>
  listAdminUsers(ref: ExchangeRef, accessToken: string, page: number, pageSize: number, signal?: AbortSignal): Promise<Page<UserOverview>>
  getUserOverview(ref: ExchangeRef, accessToken: string, id: number, signal?: AbortSignal): Promise<UserOverview>
  revokeUserSession(ref: ExchangeRef, accessToken: string, id: number): Promise<void>
  listAuditLogs(
    ref: ExchangeRef,
    accessToken: string,
    filters: AuditFilters,
    page: number,
    pageSize: number,
    signal?: AbortSignal,
  ): Promise<Page<AuditEvent>>
}

export interface TokenStore {
  load(): TokenPair | null
  save(tokens: TokenPair): void
  clear(): void
  /** Calls `listener` when another tab saves or clears the pair. */
  subscribe(listener: (tokens: TokenPair | null) => void): () => void
}

export interface Clock {
  now(): number
}

export type OpenExchange = ExchangeRef & Pick<Exchange, 'method' | 'path'>

export interface ExchangeRecorder {
  open(exchange: OpenExchange): void
  close(id: string, status: number, traceId?: string): void
  /** Forgets an exchange its caller cancelled. */
  discard(id: string): void
}
