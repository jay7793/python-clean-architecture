import { Fragment } from 'react'
import type { ApiError } from '../../domain/errors'
import { useSession } from '../services'

export function AdminRequired({ error }: { error: ApiError }) {
  const session = useSession()
  const email = session.status === 'authenticated' ? session.user.email : '<email>'
  const command = ['uv', 'run', 'python', '-m', 'app.infrastructure.cli', 'grant-permission', email, 'admin']
  return (
    <div className="animate-pop p-6 sm:p-8" data-tour="admin-required">
      <h2 className="text-lg font-bold text-ink">This account is not an admin</h2>
      <p className="mt-1.5 max-w-[60ch] text-ink-2">
        The API refused the request. Grant the admin permission from the <code>backend/</code> folder, then reload this
        page.
      </p>
      <pre className="mt-4 overflow-x-auto rounded-sm border border-rule bg-mint px-4 py-3 text-sm leading-relaxed whitespace-pre-wrap">
        {/* Each argument is one unbreakable box, so a narrow card wraps between arguments and never inside one. */}
        <code>
          {command.map((part, index) => (
            <Fragment key={index}>
              {index > 0 && ' '}
              <span className="inline-block whitespace-nowrap">{part}</span>
            </Fragment>
          ))}
        </code>
      </pre>
      <p className="mt-3 text-sm text-ink-3 tabular-nums">
        HTTP {error.status} · trace_id <code>{error.traceId}</code>
      </p>
    </div>
  )
}
