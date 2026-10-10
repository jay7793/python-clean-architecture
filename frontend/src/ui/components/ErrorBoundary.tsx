import { Component, type ReactNode } from 'react'
import { secondaryButton } from './classes'

type Props = { children: ReactNode }
type State = { error: Error | null }

/** Catches failures that are not an ApiError, which are bugs, and offers a reload instead of a blank page. */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null }

  static getDerivedStateFromError(thrown: unknown): State {
    return { error: thrown instanceof Error ? thrown : new Error(String(thrown)) }
  }

  render() {
    const { error } = this.state
    if (!error) return this.props.children
    return (
      <section role="alert" aria-labelledby="crash-heading" className="mx-auto max-w-[560px] py-10">
        <h1 id="crash-heading" className="text-2xl font-bold text-ink">
          Something went wrong
        </h1>
        <p className="mt-2 text-ink-2">The page hit an error it does not know how to handle. Reloading usually fixes it.</p>
        <p className="mt-3 font-mono text-sm break-words text-ink-3">{error.message}</p>
        <button type="button" className={`${secondaryButton} mt-6`} onClick={() => window.location.reload()}>
          Reload the page
        </button>
      </section>
    )
  }
}
