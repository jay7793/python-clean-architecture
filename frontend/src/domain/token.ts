export type TokenClaims = {
  sub: string
  jti: string
  /** Seconds since the epoch, as in the JWT `exp` claim. */
  exp: number
  /** Seconds since the epoch, as in the JWT `iat` claim. */
  iat?: number
}
