import type { TokenPair, User } from './user'

export type Session =
  | { status: 'loading' }
  | { status: 'anonymous'; notice?: string }
  | { status: 'authenticated'; user: User; tokens: TokenPair }

export const SESSION_ENDED_NOTICE =
  'Your session ended. This account signed in somewhere else or the token expired.'
