import type { TokenClaims } from '../domain/token'

function decodeSegment(segment: string): unknown {
  const base64 = segment.replace(/-/g, '+').replace(/_/g, '/')
  const bytes = Uint8Array.from(atob(base64.padEnd(Math.ceil(base64.length / 4) * 4, '=')), (c) => c.charCodeAt(0))
  return JSON.parse(new TextDecoder().decode(bytes))
}

/** Display only: the browser never trusts these claims, the API verifies the signature. */
export function decodeClaims(token: string): TokenClaims | null {
  const payload = token.split('.')[1]
  if (payload === undefined) return null
  try {
    const claims = decodeSegment(payload) as Record<string, unknown>
    const { sub, jti, exp, iat } = claims
    if ((typeof sub !== 'string' && typeof sub !== 'number') || typeof jti !== 'string' || typeof exp !== 'number') return null
    return { sub: String(sub), jti, exp, ...(typeof iat === 'number' && { iat }) }
  } catch {
    return null
  }
}
