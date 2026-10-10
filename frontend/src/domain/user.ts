export type User = {
  id: number
  email: string
  first_name: string
  last_name: string
  created_at: string
  updated_at: string
}

export type TokenPair = { access: string; refresh: string }

export type LoginResult = { user: User; token: TokenPair }

export type Credentials = { email: string; password: string }

export type Registration = Credentials & { first_name: string; last_name: string }

/**
 * A user as the admin routes return it: the account, whether it holds the admin permission, and whether it is
 * protected. A protected account (a public demo account) refuses edits, deletion and session revokes.
 */
export type AdminUser = User & { is_admin: boolean; protected: boolean }

export type Role = 'admin' | 'member'

/** The user's stored session. An active one was used at some time; a signed-out one may never have existed. */
export type UserSession = { active: true; last_active_at: string } | { active: false; last_active_at: string | null }

/** A user as the admin list shows them. last_sign_in_at is null when no sign-in was recorded. */
export type UserOverview = User & { role: Role; session: UserSession; last_sign_in_at: string | null; protected: boolean }

export type NewAccount = Registration & { is_admin: boolean }

/** An edit of an account. A missing field stays as it is. */
export type AccountChanges = Partial<NewAccount>

export type Page<T> = { data: T[]; page: number; page_size: number; total_page: number; total_data: number }

/** Rows on one page of the users list. The inspector's replay asks for the same page the Users page shows. */
export const USERS_PAGE_SIZE = 10
