import { ViewTransition } from 'react'
import { Outlet, useLocation } from 'react-router'
import { ErrorBoundary } from '../components/ErrorBoundary'
import { useMediaQuery } from '../components/useMediaQuery'

/**
 * Router updates run in a transition, so a keyed boundary lets the leaving page fade out while the new one rises in.
 * The error boundary is keyed by path too, so leaving a page that crashed shows the next page.
 */
export function RoutedPage() {
  const { pathname } = useLocation()
  const reduced = useMediaQuery('(prefers-reduced-motion: reduce)')
  const page = (
    <ErrorBoundary key={pathname}>
      <Outlet />
    </ErrorBoundary>
  )
  if (reduced) return page
  return (
    <ViewTransition key={pathname} default="none" exit="page-out">
      {page}
    </ViewTransition>
  )
}
