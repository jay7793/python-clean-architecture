import { useEffect, useEffectEvent, useState } from 'react'
import { ApiError, SessionEndedError } from '../../domain/errors'

export type ApiLoad<T> =
  | { status: 'loading' }
  | { status: 'loaded'; value: T }
  | { status: 'forbidden'; error: ApiError }
  | { status: 'failed'; error: ApiError }

type Settled<T> = { key: string; load: ApiLoad<T> } | { key: string; crash: unknown }

/**
 * Loads once per key; a new key shows loading again instead of the previous key's answer.
 * Leaving the key or unmounting aborts the load, so StrictMode's doubled effect sends one request.
 * A rejection that is not an ApiError is a bug and goes to the nearest ErrorBoundary.
 */
export function useApiLoad<T>(key: string, load: (signal: AbortSignal) => Promise<T>): ApiLoad<T> {
  const [result, setResult] = useState<Settled<T> | null>(null)
  const start = useEffectEvent(load)

  useEffect(() => {
    const controller = new AbortController()
    start(controller.signal).then(
      (value) => setResult({ key, load: { status: 'loaded', value } }),
      (error: unknown) => {
        // A session that ended already sends the visitor to sign in.
        if (controller.signal.aborted || error instanceof SessionEndedError) return
        if (!(error instanceof ApiError)) return setResult({ key, crash: error })
        setResult({ key, load: { status: error.status === 403 ? 'forbidden' : 'failed', error } })
      },
    )
    return () => controller.abort()
  }, [key])

  if (result?.key !== key) return { status: 'loading' }
  if ('crash' in result) throw result.crash
  return result.load
}
