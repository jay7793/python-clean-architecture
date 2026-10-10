import { Navigate, Outlet, useLocation } from 'react-router'
import { useSession } from '../services'

export function RequireSession() {
  const session = useSession()
  const location = useLocation()
  if (session.status === 'loading') return <p className="text-ink-3" role="status">Restoring your session</p>
  if (session.status === 'anonymous') return <Navigate to="/login" replace state={{ from: location.pathname }} />
  return <Outlet />
}

export function GuestOnly() {
  const session = useSession()
  const location = useLocation()
  if (session.status !== 'authenticated') return <Outlet />
  const from = (location.state as { from?: string } | null)?.from
  return <Navigate to={from ?? '/profile'} replace />
}
