import type { ReactNode } from 'react'

/**
 * Stand-ins for sections the product does not have yet. They never shimmer, so they cannot be mistaken for a load
 * that is stuck; only real loading shimmers.
 */
export function SkeletonBlock({ className = '', children }: { className?: string; children?: ReactNode }) {
  return (
    <div aria-hidden="true" data-placeholder="" className={`pointer-events-none select-none ${className}`}>
      {children}
    </div>
  )
}

const bar = 'rounded-full bg-g100'

export function SkeletonStat({ className = '' }: { className?: string }) {
  return (
    <SkeletonBlock className={`rounded-md bg-white p-5 shadow-sm ring-1 ring-rule ${className}`}>
      <div className="flex items-center gap-3">
        <div className="size-9 flex-none rounded-sm bg-g100" />
        <div className={`h-2.5 w-2/5 ${bar}`} />
      </div>
      <div className="mt-5 h-6 w-1/2 rounded-sm bg-rule" />
      <div className={`mt-3 h-2 w-3/4 ${bar}`} />
    </SkeletonBlock>
  )
}

export function SkeletonNavRow({ width }: { width: string }) {
  return (
    <SkeletonBlock className="flex h-10 items-center gap-3 px-3">
      <div className="size-[18px] flex-none rounded-[6px] bg-g100" />
      <div className={`h-2.5 ${bar}`} style={{ width }} />
    </SkeletonBlock>
  )
}
