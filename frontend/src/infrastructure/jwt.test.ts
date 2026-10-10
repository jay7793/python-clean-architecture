import { describe, expect, it } from 'vitest'
import { decodeClaims } from './jwt'

const base64url = (value: object) =>
  btoa(JSON.stringify(value)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')

const jwt = (payload: object) => `${base64url({ alg: 'HS256', typ: 'JWT' })}.${base64url(payload)}.signature`

describe('decodeClaims', () => {
  it('reads sub, jti, exp and iat from the payload without verifying the signature', () => {
    const token = jwt({ sub: '42', jti: 'f0e1d2c3-~?>', exp: 1_900_000_000, iat: 1_899_913_600 })

    expect(decodeClaims(token)).toEqual({ sub: '42', jti: 'f0e1d2c3-~?>', exp: 1_900_000_000, iat: 1_899_913_600 })
  })

  it('leaves iat out when the token has none', () => {
    expect(decodeClaims(jwt({ sub: '42', jti: 'j', exp: 1 }))).toEqual({ sub: '42', jti: 'j', exp: 1 })
  })

  it('accepts a numeric sub', () => {
    expect(decodeClaims(jwt({ sub: 7, jti: 'j', exp: 1 }))?.sub).toBe('7')
  })

  it.each([['not a token'], ['a.!!!.c'], [jwt({ sub: '1', exp: 1 })]])('returns null for %s', (token) => {
    expect(decodeClaims(token)).toBeNull()
  })
})
