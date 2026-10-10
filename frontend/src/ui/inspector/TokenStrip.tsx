import { useState } from 'react'
import type { Session } from '../../domain/session'
import type { TokenClaims } from '../../domain/token'
import { countdown } from './countdown'

type Decode = (token: string) => TokenClaims | null
type Props = { session: Session; decode: Decode; now: number }

const clock = new Intl.DateTimeFormat('en', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false })

/** Below this share of its lifetime the access token reads as nearly expired. */
const ENDING = 0.1

export function TokenStrip({ session, decode, now }: Props) {
  if (session.status !== 'authenticated') {
    return <p className="border-b border-rule px-6 py-4 text-sm text-ink-3">No tokens yet. Sign in to see them here.</p>
  }
  return (
    <div className="grid gap-4 border-b border-rule px-6 py-4" data-tour="token-strip">
      <TokenRow label="Access token" claims={decode(session.tokens.access)} now={now} />
      <TokenRow label="Refresh token" claims={decode(session.tokens.refresh)} now={now} fixedExpiry />
    </div>
  )
}

type Rotation = { outgoing: string | null; keptExpiry: boolean }

/** Remembers the jti a rotation replaced until its strike-out ends, and whether the rotation kept the expiry. */
function useRotation(claims: TokenClaims | null): [Rotation | null, () => void] {
  const [settled, setSettled] = useState(claims)
  const [rotation, setRotation] = useState<Rotation | null>(null)
  if (claims?.jti !== settled?.jti) {
    setSettled(claims)
    setRotation(claims && settled ? { outgoing: settled.jti, keptExpiry: claims.exp === settled.exp } : null)
  }
  return [rotation, () => setRotation((current) => current && { ...current, outgoing: null })]
}

const short = (jti: string) => jti.slice(0, 8)

type RowProps = { label: string; claims: TokenClaims | null; now: number; fixedExpiry?: boolean }

function TokenRow({ label, claims, now, fixedExpiry = false }: RowProps) {
  const [rotation, settle] = useRotation(claims)
  if (!claims) {
    return (
      <div role="group" aria-label={label} className="flex items-baseline justify-between gap-3 text-sm">
        <span className="font-bold text-g900">{label}</span>
        <span className="text-danger">Not a readable JWT</span>
      </div>
    )
  }
  const expiresAt = claims.exp * 1000
  const left = countdown(claims.exp, now)
  const share = claims.iat === undefined ? null : Math.min(1, Math.max(0, (expiresAt - now) / ((claims.exp - claims.iat) * 1000)))
  const ending = left === 'expired' ? 'text-danger' : share !== null && share < ENDING ? 'text-amber-text' : 'text-g900'
  return (
    <div role="group" aria-label={label} className="grid gap-1.5">
      <div className="flex items-baseline justify-between gap-3 text-sm">
        <span className="font-bold text-g900">{label}</span>
        {fixedExpiry ? (
          <span className="text-ink-2">
            Expires{' '}
            <time
              key={claims.jti}
              data-lock-on={rotation?.keptExpiry || undefined}
              className="rounded-md bg-pear-100 px-1.5 py-0.5 font-bold text-g700 tabular-nums ring-1 ring-pear data-[lock-on]:animate-lock-on"
              dateTime={new Date(expiresAt).toISOString()}
            >
              {clock.format(expiresAt)}
            </time>
          </span>
        ) : (
          <span className="overflow-hidden text-ink-2">
            Expires in{' '}
            <time className={`font-bold tabular-nums ${ending}`} dateTime={new Date(expiresAt).toISOString()}>
              {/* Keyed on the minute: the seconds tick in place, and the text rolls only when a minute turns over. */}
              <span key={Math.floor((expiresAt - now) / 60_000)} className="inline-block animate-roll">
                {left}
              </span>
            </time>
          </span>
        )}
      </div>
      <div className="flex items-center gap-3 text-xs text-ink-3">
        {fixedExpiry ? (
          <span className="mr-auto">Stays fixed when it rotates</span>
        ) : (
          share !== null && <LifetimeMeter share={share} ending={share < ENDING} />
        )}
        {rotation?.outgoing && <span className="animate-pop rounded-full bg-pear-100 px-2 font-bold text-g700 ring-1 ring-pear">Rotated</span>}
        <span className="ml-auto flex items-baseline gap-1.5">
          jti
          <span className="relative overflow-hidden">
            {rotation?.outgoing && (
              <code aria-hidden="true" data-outgoing="" className="absolute inset-0 block animate-strike-out" onAnimationEnd={settle}>
                {short(rotation.outgoing)}
              </code>
            )}
            <code key={claims.jti} className={`block animate-roll text-ink-2 ${rotation?.outgoing ? '[animation-delay:240ms]' : ''}`} title={claims.jti}>
              {short(claims.jti)}
            </code>
          </span>
        </span>
      </div>
    </div>
  )
}

/** Drains toward expiry. Animating scaleX keeps the per-second tick off layout. */
function LifetimeMeter({ share, ending }: { share: number; ending: boolean }) {
  return (
    <span
      role="meter"
      aria-label="Lifetime left"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(share * 100)}
      className="h-1.5 min-w-0 flex-1 overflow-hidden rounded-full bg-g100"
    >
      <span
        className={`block h-full origin-left transition-[transform,background-color] duration-1000 ease-linear ${ending ? 'bg-amber' : 'bg-g300'}`}
        style={{ transform: `scaleX(${share})` }}
      />
    </span>
  )
}
