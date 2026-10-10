/** The public accounts that `python -m app.infrastructure.cli seed-demo` creates (DEMO_ACCOUNTS in backend/). */
export type DemoAccount = {
  role: 'Admin' | 'Member'
  outcome: string
  email: string
  password: string
}

export const DEMO_ACCOUNTS: readonly DemoAccount[] = [
  { role: 'Admin', outcome: 'Manages users and reads the audit log', email: 'admin@demo.test', password: 'demo-admin-pass' },
  { role: 'Member', outcome: 'Gets the 403 admin state', email: 'member@demo.test', password: 'demo-member-pass' },
]

export function demoAccountsShown(): boolean {
  return import.meta.env.VITE_SHOW_DEMO_ACCOUNTS !== 'false'
}
