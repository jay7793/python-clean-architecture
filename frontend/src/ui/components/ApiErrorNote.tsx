import { CircleAlert } from 'lucide-react'
import type { ApiError } from '../../domain/errors'
import { errorCopy } from './errorCopy'

export function ApiErrorNote({ error }: { error: ApiError }) {
  const copy = errorCopy(error)
  return (
    <div
      className="flex animate-drop gap-2.5 rounded-sm border border-danger-line bg-danger-wash px-4 py-3 text-sm text-danger"
      role="alert"
      data-api-error
    >
      <CircleAlert className="mt-0.5 flex-none" size={16} aria-hidden />
      <div className="grid min-w-0 gap-0.5">
        <p className="font-bold">{copy ?? error.message}</p>
        <p className="text-ink-2 tabular-nums">
          {error.status > 0 && <>HTTP {error.status} · </>}trace_id <code className="break-all">{error.traceId}</code>
          {copy && <> · {error.message}</>}
        </p>
      </div>
    </div>
  )
}
