export type Role = 'admin' | 'member'

/** The `data-tour` values the tour points at. Each one is set on exactly one kind of element in the UI. */
export type TourTarget = 'nav' | 'users-list' | 'admin-required' | 'inspector-button' | 'replay' | 'token-strip' | 'audit-log-link'

/** What a step opens before it looks for its target, and closes again when the tour moves on. */
export type Reveal = 'nav-drawer' | 'inspector'

export type TourStep = {
  id: string
  /** The page the step needs. The tour goes there first; without a route it stays on the current page. */
  route?: string
  /** No target: the card sits in the middle of the screen. */
  target: TourTarget | null
  title: string
  body: string
  audience: Role | 'all'
  /** Hold the card until the page shows whether the account is an admin, so the step count does not change under it. */
  waitFor?: 'role'
  reveal?: Reveal
}

/** The users page shows the list to an admin and the 403 instructions to a member, so whichever appears names the role. */
export const ROLE_EVIDENCE: Record<Role, TourTarget> = { admin: 'users-list', member: 'admin-required' }

export const TOUR_STEPS: readonly TourStep[] = [
  {
    id: 'nav',
    route: '/users',
    target: 'nav',
    title: 'Pages come from one table',
    body: 'These links, the header title and the breadcrumb all read ui/layout/nav.ts. A new page is one entry there and one route in App.tsx.',
    audience: 'all',
    waitFor: 'role',
    reveal: 'nav-drawer',
  },
  {
    id: 'users',
    route: '/users',
    target: 'users-list',
    title: 'Rows are links',
    body: 'Click anywhere on a row to open that user, with Edit and Delete. New user, above the table, creates one through the admin API.',
    audience: 'admin',
  },
  {
    id: 'admin-required',
    route: '/users',
    target: 'admin-required',
    title: 'This account is not an admin',
    body: 'The API answered 403 middleware-004. Run the command shown here from backend/, then reload to see the users.',
    audience: 'member',
  },
  {
    id: 'inspector',
    target: 'inspector-button',
    title: 'Every API call lands here',
    body: 'The session inspector lists every API request, newest first, with what each answer means. The badge counts them.',
    audience: 'all',
  },
  {
    id: 'replay',
    target: 'replay',
    title: 'Replay a 401',
    body: 'Breaks the access token, then loads two pages at once. The checklist then shows whether both 401s shared one refresh.',
    audience: 'all',
    reveal: 'inspector',
  },
  {
    id: 'tokens',
    target: 'token-strip',
    title: 'Both tokens, decoded',
    body: 'After a refresh, the old jti is struck out and the new one rolls in. The refresh expiry stays the same, because rotation keeps the original exp.',
    audience: 'all',
    reveal: 'inspector',
  },
  {
    id: 'audit-log',
    target: 'audit-log-link',
    title: 'Audit log',
    body: 'Sign-ins, user changes and permission grants, newest first. Filter by action, outcome or actor, and open a row for its details.',
    audience: 'admin',
    reveal: 'nav-drawer',
  },
  {
    id: 'done',
    target: null,
    title: 'Read more in the README',
    body: 'README.md explains the layers, the refresh flow, the inspector and the API, and traces a login through the backend files. Take the tour, in the header, runs this again.',
    audience: 'all',
  },
]
