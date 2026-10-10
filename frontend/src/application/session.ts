import type { AuditEvent, AuditFilters } from '../domain/audit'
import { ApiError, SessionEndedError } from '../domain/errors'
import { SESSION_ENDED_NOTICE, type Session } from '../domain/session'
import type {
  AccountChanges,
  AdminUser,
  Credentials,
  NewAccount,
  Page,
  Registration,
  TokenPair,
  User,
  UserOverview,
} from '../domain/user'
import type { AuthApi, ExchangeRef, TokenStore } from './ports'

type Deps = { api: AuthApi; store: TokenStore }

export class SessionController {
  private session: Session = { status: 'loading' }
  private tokens: TokenPair | null = null
  private readonly listeners = new Set<() => void>()
  private readonly api: AuthApi
  private readonly store: TokenStore
  private sequence = 0
  private refreshing: { ref: ExchangeRef; tokens: Promise<TokenPair> } | null = null

  constructor({ api, store }: Deps) {
    this.api = api
    this.store = store
  }

  getSession(): Session {
    return this.session
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  /** Restores the stored session, then follows the pair other tabs save or clear. */
  async start(): Promise<void> {
    this.store.subscribe((tokens) => this.follow(tokens))
    const tokens = this.store.load()
    if (!tokens) return this.become({ status: 'anonymous' })
    await this.restore(tokens)
  }

  register(input: Registration): Promise<User> {
    return this.api.register(this.ref({ kind: 'request' }), input)
  }

  async login(credentials: Credentials): Promise<void> {
    const { user, token } = await this.api.login(this.ref({ kind: 'request' }), credentials)
    this.adopt(token)
    this.become({ status: 'authenticated', user, tokens: token })
  }

  async logout(): Promise<void> {
    const tokens = this.tokens
    this.end({ status: 'anonymous' })
    if (!tokens) return
    try {
      await this.api.logout(this.ref({ kind: 'request' }), tokens.refresh)
    } catch (error) {
      if (!(error instanceof ApiError)) throw error
    }
  }

  /** Swaps the access token's signature in memory so the API rejects it, which demonstrates the refresh flow. */
  tamperAccessToken(): void {
    if (!this.tokens) return
    const [header, payload] = this.tokens.access.split('.')
    this.tokens = { ...this.tokens, access: `${header}.${payload}.tampered` }
  }

  profile(signal?: AbortSignal): Promise<User> {
    return this.authenticated((ref, access) => this.api.profile(ref, access, signal))
  }

  createUser(input: NewAccount): Promise<AdminUser> {
    return this.authenticated((ref, access) => this.api.createUser(ref, access, input))
  }

  getAdminUser(id: number, signal?: AbortSignal): Promise<AdminUser> {
    return this.authenticated((ref, access) => this.api.getAdminUser(ref, access, id, signal))
  }

  updateUser(id: number, changes: AccountChanges): Promise<AdminUser> {
    return this.authenticated((ref, access) => this.api.updateUser(ref, access, id, changes))
  }

  deleteUser(id: number): Promise<void> {
    return this.authenticated((ref, access) => this.api.deleteUser(ref, access, id))
  }

  listAdminUsers(page: number, pageSize: number, signal?: AbortSignal): Promise<Page<UserOverview>> {
    return this.authenticated((ref, access) => this.api.listAdminUsers(ref, access, page, pageSize, signal))
  }

  getUserOverview(id: number, signal?: AbortSignal): Promise<UserOverview> {
    return this.authenticated((ref, access) => this.api.getUserOverview(ref, access, id, signal))
  }

  revokeUserSession(id: number): Promise<void> {
    return this.authenticated((ref, access) => this.api.revokeUserSession(ref, access, id))
  }

  listAuditLogs(filters: AuditFilters, page: number, pageSize: number, signal?: AbortSignal): Promise<Page<AuditEvent>> {
    return this.authenticated((ref, access) => this.api.listAuditLogs(ref, access, filters, page, pageSize, signal))
  }

  private async authenticated<T>(call: (ref: ExchangeRef, accessToken: string) => Promise<T>): Promise<T> {
    if (!this.tokens) throw new Error('not signed in')
    const { access, refresh } = this.tokens
    const request = this.ref({ kind: 'request' })
    try {
      return await call(request, access)
    } catch (error) {
      if (!(error instanceof ApiError && error.status === 401)) throw error
      // This tab or another one already rotated the pair; refreshing again with the old refresh token would end the session.
      const stored = this.storedPairAfter(refresh)
      if (stored) return call(this.ref({ kind: 'retry', parentId: request.id, repeats: request.id }), stored.access)
      const refreshing = this.refreshOnce(request.id, refresh)
      const renewed = await refreshing.tokens
      return call(this.ref({ kind: 'retry', parentId: refreshing.ref.id, repeats: request.id }), renewed.access)
    }
  }

  private refreshOnce(parentId: string, refreshToken: string): { ref: ExchangeRef; tokens: Promise<TokenPair> } {
    if (this.refreshing) return this.refreshing
    const ref = this.ref({ kind: 'refresh', parentId })
    const tokens = this.api
      .refresh(ref, refreshToken)
      .then(
        ({ token }) => {
          this.adopt(token)
          return token
        },
        (error: unknown) => {
          if (!(error instanceof ApiError && error.status === 401)) throw error
          const stored = this.storedPairAfter(refreshToken)
          if (stored) return stored
          this.end({ status: 'anonymous', notice: SESSION_ENDED_NOTICE })
          throw new SessionEndedError()
        },
      )
      .finally(() => {
        this.refreshing = null
      })
    this.refreshing = { ref, tokens }
    return this.refreshing
  }

  /** The stored pair when a refresh rotated past `refreshToken`, now in use here too. */
  private storedPairAfter(refreshToken: string): TokenPair | null {
    const stored = this.store.load()
    if (!stored || stored.refresh === refreshToken) return null
    this.use(stored)
    return stored
  }

  private async restore(tokens: TokenPair): Promise<void> {
    this.tokens = tokens
    try {
      const user = await this.profile()
      if (this.tokens) this.become({ status: 'authenticated', user, tokens: this.tokens })
    } catch (error) {
      if (error instanceof SessionEndedError) return
      if (!(error instanceof ApiError)) throw error
      this.tokens = null
      this.become({ status: 'anonymous', notice: error.message })
    }
  }

  private follow(tokens: TokenPair | null): void {
    if (tokens && this.session.status === 'anonymous') return void this.restore(tokens)
    if (tokens) return this.use(tokens)
    this.tokens = null
    this.become({ status: 'anonymous' })
  }

  private adopt(tokens: TokenPair): void {
    this.use(tokens)
    this.store.save(tokens)
  }

  private use(tokens: TokenPair): void {
    this.tokens = tokens
    if (this.session.status === 'authenticated') this.become({ ...this.session, tokens })
  }

  private end(next: Session & { status: 'anonymous' }): void {
    this.tokens = null
    this.store.clear()
    this.become(next)
  }

  private ref(link: Omit<ExchangeRef, 'id'>): ExchangeRef {
    this.sequence += 1
    return { id: `x${this.sequence}`, ...link }
  }

  private become(next: Session): void {
    this.session = next
    for (const listener of this.listeners) listener()
  }
}
