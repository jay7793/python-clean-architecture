import { Button } from '@base-ui/react/button'
import { CircleCheck, CircleX, FlaskConical } from 'lucide-react'
import type { CSSProperties } from 'react'
import { NO_RESPONSE, type Exchange, type ReplayCheck, type ReplayReport } from '../../domain/exchange'
import { secondaryButton } from '../components/classes'
import { shortPath } from './requestCopy'

type Step = { label: string; evidence: (exchanges: readonly Exchange[]) => string; note?: (exchanges: readonly Exchange[]) => string | undefined }

const answer = (e: Exchange) => (e.status === undefined ? 'waiting' : e.status === NO_RESPONSE ? 'no response' : String(e.status))

/** "2 × 401 middleware-002": how many times each distinct line occurred, in first-seen order. */
function tally(lines: readonly string[]): string {
  const counts = new Map<string, number>()
  for (const line of lines) counts.set(line, (counts.get(line) ?? 0) + 1)
  return [...counts].map(([line, count]) => `${count} × ${line}`).join(', ')
}

const STEPS: readonly [Step, Step, Step] = [
  {
    label: 'Profile and Users both get 401',
    evidence: (rejected) => (rejected.length ? tally(rejected.map((e) => [answer(e), e.traceId].filter(Boolean).join(' '))) : 'No 401 came back'),
  },
  {
    label: 'One refresh is sent for both',
    evidence: (refreshes) => (refreshes.length ? tally(refreshes.map((e) => `${e.method} ${shortPath(e.path).route} ${answer(e)}`)) : 'No refresh was sent'),
  },
  {
    label: 'Both retry with the new token',
    evidence: (retries) => (retries.length ? `${retries.length} ${retries.length === 1 ? 'retry' : 'retries'}: ${retries.map(answer).join(', ')}` : 'No retry was sent'),
    note: (retries) => (retries.some((e) => e.status === 403) ? 'The 403 is expected: the new token worked, and Users is admin-only.' : undefined),
  },
]

type Props = { report: ReplayReport | null; onReplay: () => void }

export function ReplayPanel({ report, onReplay }: Props) {
  const checks = report?.state === 'settled' ? [report.rejected, report.refreshed, report.retried] : null
  return (
    <section className="grid justify-items-start gap-3 border-b border-rule px-6 pt-4 pb-5" data-tour="replay">
      <Button className={secondaryButton} onClick={onReplay} aria-describedby="replay-what">
        <FlaskConical size={16} aria-hidden />
        Replay with a tampered access token
      </Button>
      <p id="replay-what" className="text-xs text-ink-3">
        Breaks the access token in memory, then loads Profile and Users at once.
      </p>
      <div aria-live="polite" className="w-full">
        <ol className="m-0 grid list-none gap-2.5 p-0" aria-label={checks ? 'Replay result' : "What you'll see"}>
          {STEPS.map((step, index) => (
            <StepItem key={`${index}-${checks ? 'checked' : 'plan'}`} step={step} index={index} check={checks?.[index]} />
          ))}
        </ol>
      </div>
    </section>
  )
}

function StepItem({ step, index, check }: { step: Step; index: number; check?: ReplayCheck }) {
  if (!check) {
    return (
      <li className="flex items-start gap-2.5 text-sm text-ink-2">
        <span aria-hidden="true" className="grid size-5 flex-none place-items-center rounded-full bg-mint text-xs font-bold text-g700 ring-1 ring-rule">
          {index + 1}
        </span>
        {step.label}
      </li>
    )
  }
  const note = step.note?.(check.exchanges)
  return (
    <li className="flex animate-pop items-start gap-2.5 [animation-delay:calc(var(--i)*60ms)]" style={{ '--i': index } as CSSProperties}>
      <span className="sr-only">{check.passed ? 'Passed' : 'Failed'}</span>
      {check.passed ? (
        <CircleCheck size={20} aria-hidden className="flex-none text-g600" />
      ) : (
        <CircleX size={20} aria-hidden className="flex-none text-danger" />
      )}
      <span className="grid min-w-0 gap-0.5">
        <span className="text-sm text-ink">{step.label}</span>
        <code className="text-xs text-ink-2">{step.evidence(check.exchanges)}</code>
        {note && <span className="text-xs text-pretty text-ink-3">{note}</span>}
      </span>
    </li>
  )
}
