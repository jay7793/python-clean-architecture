import { ScrollText, UserRound, Users, type LucideIcon } from 'lucide-react'
import type { TourTarget } from '../tour/steps'

export type NavItem = { to: string; label: string; icon: LucideIcon; tour?: TourTarget }
export type NavGroup = { label: string; items: NavItem[] }

export const NAV: NavGroup[] = [
  { label: 'Account', items: [{ to: '/profile', label: 'Profile', icon: UserRound }] },
  {
    label: 'Admin',
    items: [
      { to: '/users', label: 'Users', icon: Users },
      { to: '/audit-log', label: 'Audit log', icon: ScrollText, tour: 'audit-log-link' },
    ],
  },
]

/** A nav page, or a page below one (such as /users/7), whose title the page itself supplies. */
export type PageAt = { group: string; title: string } | { group: string; parent: string }

export function pageAt(pathname: string): PageAt | undefined {
  for (const group of NAV) {
    for (const item of group.items) {
      if (item.to === pathname) return { group: group.label, title: item.label }
      if (pathname.startsWith(`${item.to}/`)) return { group: group.label, parent: item.label }
    }
  }
}
