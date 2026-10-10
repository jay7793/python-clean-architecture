import { addTransitionType, startTransition, useState } from 'react'
import { Link } from 'react-router'
import { InspectorButton } from '../inspector/InspectorButton'
import { card } from '../components/classes'
import { useMediaQuery } from '../components/useMediaQuery'
import { useSession } from '../services'
import { GuidedTour, type Panels } from '../tour/GuidedTour'
import { AppShell } from './AppShell'
import { HOME_LINK_NAME, Mark } from './Mark'
import { RoutedPage } from './RoutedPage'

export function Shell() {
  const signedIn = useSession().status === 'authenticated'
  const [inspectorOpen, setInspectorOpen] = useState(false)
  const [navOpen, setNavOpen] = useState(false)
  const roomBeside = useMediaQuery('(min-width: 1280px)')
  const reduced = useMediaQuery('(prefers-reduced-motion: reduce)')

  // From 1280px the content narrows to sit beside the panel. Inside a typed transition React runs a view
  // transition, so the content glides to its new width instead of jumping.
  function toggleInspector(open: boolean) {
    if (!signedIn || !roomBeside || reduced) return setInspectorOpen(open)
    startTransition(() => {
      addTransitionType('inspector')
      setInspectorOpen(open)
    })
  }

  const panels: Panels = {
    inspector: { open: inspectorOpen, onOpenChange: toggleInspector },
    'nav-drawer': { open: navOpen, onOpenChange: setNavOpen },
  }

  return (
    <div className="min-h-dvh">
      {signedIn ? (
        <GuidedTour panels={panels}>
          <AppShell inspectorOpen={inspectorOpen} nav={panels['nav-drawer']} />
        </GuidedTour>
      ) : (
        <main className="grid min-h-dvh place-items-center px-4 py-10 max-sm:pb-24">
          <div className={`${card} w-full max-w-[420px] animate-rise p-7 sm:p-9`}>
            <Link
              to="/login"
              aria-label={HOME_LINK_NAME}
              className="mb-8 flex w-fit items-center gap-2.5 rounded-sm font-bold text-g900 no-underline hover:text-g900"
            >
              <Mark />
              Clean Architecture · Python
            </Link>
            <RoutedPage />
          </div>
        </main>
      )}
      <InspectorButton open={inspectorOpen} onOpenChange={toggleInspector} belowHeader={signedIn} />
    </div>
  )
}
