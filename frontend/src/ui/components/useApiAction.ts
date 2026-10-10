import { useState } from 'react'
import { ApiError } from '../../domain/errors'

type Outcome = { status: 'idle' } | { status: 'failed'; error: ApiError } | { status: 'crashed'; thrown: unknown }

/**
 * Runs an API call and keeps the last ApiError for display. Anything else is a bug: it is thrown while
 * rendering, so the nearest ErrorBoundary shows it instead of an unhandled rejection nobody sees.
 */
export function useApiAction() {
  const [outcome, setOutcome] = useState<Outcome>({ status: 'idle' })
  if (outcome.status === 'crashed') throw outcome.thrown

  async function run(action: () => Promise<void>) {
    setOutcome({ status: 'idle' })
    try {
      await action()
    } catch (caught) {
      setOutcome(caught instanceof ApiError ? { status: 'failed', error: caught } : { status: 'crashed', thrown: caught })
    }
  }
  return { error: outcome.status === 'failed' ? outcome.error : null, run }
}
