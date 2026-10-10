import { Dialog } from '@base-ui/react/dialog'
import { Activity, X } from 'lucide-react'
import { useState } from 'react'
import { NO_RESPONSE, type Exchange } from '../../domain/exchange'
import { useMediaQuery } from '../components/useMediaQuery'
import { useExchanges, useServices, useSession } from '../services'
import { Inspector, type ReplayMark } from './Inspector'

type Props = { open: boolean; onOpenChange: (open: boolean) => void; belowHeader: boolean }

export function InspectorButton({ open, onOpenChange, belowHeader }: Props) {
  const { exchanges: log } = useServices()
  const exchanges = useExchanges()
  const current = useSession()
  // Kept here, outside the panel, so the replay result survives closing and reopening it.
  const [replayMark, setReplayMark] = useState<ReplayMark | null>(null)
  const count = exchanges.length
  const newest = exchanges.at(-1)
  const beside = useMediaQuery('(min-width: 640px)')
  return (
    <>
      <span className="sr-only" role="log" aria-label="Latest API answer">
        {newest && answerOf(newest)}
      </span>
      <Dialog.Root open={open} onOpenChange={onOpenChange} modal={!beside} disablePointerDismissal={beside}>
        <Dialog.Trigger
          className="group fixed right-6 bottom-6 z-20 size-14 cursor-pointer rounded-full p-0 focus-visible:outline-offset-4 max-sm:right-4 max-sm:bottom-4"
          aria-label="Session inspector"
          data-tour="inspector-button"
        >
          <span
            key={newest?.id ?? 'none'}
            data-bump={newest ? '' : undefined}
            className="relative grid size-full animate-pop place-items-center rounded-full bg-g900 text-white shadow-lg transition-[background-color,scale] duration-150 group-hover:bg-g800 group-active:scale-95 data-[bump]:animate-bob"
          >
            <Activity size={22} aria-hidden />
            {count > 0 && (
              <span
                className="absolute -top-1 -right-1 grid h-6 min-w-6 animate-badge place-items-center rounded-full bg-pear px-1.5 font-display text-xs font-bold text-g900 tabular-nums ring-2 ring-white"
                aria-hidden
              >
                {count}
              </span>
            )}
          </span>
        </Dialog.Trigger>
        <Dialog.Portal>
          {!beside && (
            <Dialog.Backdrop className="fixed inset-0 z-30 bg-g900/25 transition-opacity duration-300 data-[ending-style]:opacity-0 data-[starting-style]:opacity-0" />
          )}
          <Dialog.Popup
            data-below-header={belowHeader || undefined}
            className="fixed top-3 right-3 bottom-3 z-31 flex w-[440px] max-w-[calc(100vw-24px)] origin-bottom-right flex-col overflow-hidden rounded-lg bg-white shadow-lg ring-1 ring-rule transition-[opacity,scale,translate] duration-300 ease-pop outline-none sm:data-[below-header]:top-[76px] data-[ending-style]:scale-95 data-[ending-style]:opacity-0 data-[ending-style]:duration-150 data-[ending-style]:ease-out data-[starting-style]:translate-y-3 data-[starting-style]:scale-90 data-[starting-style]:opacity-0 max-sm:top-auto max-sm:right-0 max-sm:bottom-0 max-sm:left-0 max-sm:max-h-[85dvh] max-sm:w-full max-sm:max-w-none max-sm:origin-bottom max-sm:rounded-b-none max-sm:data-[ending-style]:translate-y-full max-sm:data-[ending-style]:scale-100 max-sm:data-[starting-style]:translate-y-full max-sm:data-[starting-style]:scale-100"
          >
            <header className="flex h-16 flex-none items-center gap-2 border-b border-rule pr-3 pl-6">
              <div className="mr-auto grid min-w-0">
                <Dialog.Title className="font-bold text-g900">Session inspector</Dialog.Title>
                <p className="truncate text-xs text-ink-3">
                  {current.status === 'authenticated' ? `${current.user.first_name} ${current.user.last_name} · ${current.user.email}` : 'Signed out'}
                </p>
              </div>
              <button
                type="button"
                className="h-9 flex-none cursor-pointer rounded-full px-3 text-sm font-bold text-g700 transition-[background-color,scale,opacity] duration-150 hover:bg-mint active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-transparent"
                disabled={count === 0}
                onClick={() => {
                  setReplayMark(null)
                  log.clear()
                }}
              >
                Clear log
              </button>
              <Dialog.Close
                className="grid size-10 flex-none cursor-pointer place-items-center rounded-full text-ink-3 transition-[background-color,color,scale] duration-150 hover:bg-mint hover:text-g900 active:scale-95"
                aria-label="Close inspector"
              >
                <X size={18} aria-hidden />
              </Dialog.Close>
            </header>
            <Inspector replayMark={replayMark} onReplay={setReplayMark} />
          </Dialog.Popup>
        </Dialog.Portal>
      </Dialog.Root>
    </>
  )
}

function answerOf({ method, path, status, traceId }: Exchange): string {
  if (status === undefined) return ''
  if (status === NO_RESPONSE) return `${method} ${path} got no response`
  return `${method} ${path} answered ${status}${traceId ? ` ${traceId}` : ''}`
}
