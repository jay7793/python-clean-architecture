import { Button } from '@base-ui/react/button'
import { LogOut } from 'lucide-react'
import { useId, useLayoutEffect, useRef } from 'react'
import { Link, NavLink, useLocation, useNavigate } from 'react-router'
import { Avatar } from '../components/Avatar'
import { secondaryButton } from '../components/classes'
import { SkeletonBlock, SkeletonNavRow } from '../components/Placeholder'
import { useExchanges, useServices, useSession } from '../services'
import { HOME_LINK_NAME, Mark } from './Mark'
import { NAV, type NavGroup } from './nav'

/** Sections the product does not have yet, drawn as placeholder rows of these bar widths. */
const PLANNED_SECTIONS = ['58%', '44%', '66%', '50%']

export function Sidebar({ onNavigate }: { onNavigate?: () => void }) {
  const newestExchange = useExchanges().at(-1)
  return (
    <div className="flex h-full flex-col">
      <div className="flex h-16 flex-none items-center px-3">
        <Link
          to="/profile"
          onClick={onNavigate}
          aria-label={HOME_LINK_NAME}
          className="flex items-center gap-2.5 rounded-sm px-2 py-1 leading-tight text-g900 no-underline hover:text-g900"
        >
          <Mark activity={newestExchange?.id} />
          <span>
            <span className="block font-display font-bold">Clean Architecture</span>
            <span className="block text-xs text-ink-3">Python</span>
          </span>
        </Link>
      </div>
      <nav aria-label="Main" data-tour="nav" className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-3 pb-6">
        <PageLinks onNavigate={onNavigate} />
        <SkeletonBlock className="mt-6">
          <div className="mx-3 mb-2 h-2 w-14 rounded-full bg-g100" />
          {PLANNED_SECTIONS.map((width) => (
            <SkeletonNavRow key={width} width={width} />
          ))}
        </SkeletonBlock>
      </nav>
      <Account />
    </div>
  )
}

function PageLinks({ onNavigate }: { onNavigate?: () => void }) {
  const { pathname } = useLocation()
  const list = useRef<HTMLDivElement>(null)
  const indicator = useRef<HTMLSpanElement>(null)

  // The pear indicator is one element that slides to the current link, so it has to be placed from the link's offset.
  useLayoutEffect(() => {
    const mark = indicator.current
    const active = list.current?.querySelector<HTMLElement>('[aria-current="page"]')
    if (!mark) return
    mark.toggleAttribute('data-page', Boolean(active))
    if (active) mark.style.translate = `0 ${active.offsetTop}px`
    const frame = requestAnimationFrame(() => mark.toggleAttribute('data-ready', true))
    return () => cancelAnimationFrame(frame)
  }, [pathname])

  return (
    <div className="relative" ref={list}>
      <span
        ref={indicator}
        aria-hidden="true"
        className="absolute inset-x-0 top-0 h-10 rounded-sm bg-pear opacity-0 shadow-sm data-[page]:opacity-100 data-[ready]:transition-[translate,opacity] data-[ready]:duration-[400ms] data-[ready]:ease-pop"
      />
      {NAV.map((group) => (
        <LinkGroup key={group.label} group={group} onNavigate={onNavigate} />
      ))}
    </div>
  )
}

function LinkGroup({ group, onNavigate }: { group: NavGroup; onNavigate?: () => void }) {
  const id = useId()
  return (
    <>
      <p id={id} className="px-3 pt-5 pb-1.5 text-xs font-bold text-ink-3">
        {group.label}
      </p>
      <ul aria-labelledby={id} className="grid gap-0.5">
        {group.items.map(({ to, label, icon: Icon, tour }) => (
          <li key={to}>
            <NavLink
              to={to}
              onClick={onNavigate}
              data-tour={tour}
              className="group/link relative flex h-10 items-center gap-3 rounded-sm px-3 text-ink-2 no-underline transition-colors hover:bg-mint hover:text-g900 aria-[current=page]:font-bold aria-[current=page]:text-g900 aria-[current=page]:hover:bg-transparent"
            >
              <Icon size={18} aria-hidden className="flex-none text-g300 transition-colors group-aria-[current=page]/link:text-g900" />
              {label}
            </NavLink>
          </li>
        ))}
      </ul>
    </>
  )
}

function Account() {
  const { session } = useServices()
  const current = useSession()
  const navigate = useNavigate()
  if (current.status !== 'authenticated') return null
  const { user } = current

  async function signOut() {
    await session.logout()
    navigate('/login')
  }

  return (
    <div className="flex-none border-t border-rule p-4">
      <div className="flex items-center gap-3">
        <Avatar user={user} size="sm" />
        <span className="min-w-0 leading-snug">
          <span className="block truncate text-sm font-bold text-ink">
            {user.first_name} {user.last_name}
          </span>
          <span className="block truncate text-xs text-ink-3" title={user.email}>
            {user.email}
          </span>
        </span>
      </div>
      <Button className={`${secondaryButton} mt-3 w-full`} onClick={signOut}>
        <LogOut size={16} aria-hidden />
        Sign out
      </Button>
    </div>
  )
}
