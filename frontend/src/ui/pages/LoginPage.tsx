import { zodResolver } from '@hookform/resolvers/zod'
import { Button } from '@base-ui/react/button'
import { useId, useRef, useState } from 'react'
import { useForm } from 'react-hook-form'
import { Link, useLocation } from 'react-router'
import { z } from 'zod'
import { ApiErrorNote } from '../components/ApiErrorNote'
import { secondaryButton } from '../components/classes'
import { Notice } from '../components/Notice'
import { SubmitButton } from '../components/SubmitButton'
import { TextField } from '../components/TextField'
import { useApiAction } from '../components/useApiAction'
import { DEMO_ACCOUNTS, demoAccountsShown, type DemoAccount } from '../demoAccounts'
import { useServices, useSession } from '../services'
import type { RegisteredState } from './RegisterPage'

const schema = z.object({
  email: z.email({ error: 'Enter a valid email address.' }),
  password: z.string().min(1, { error: 'Enter your password.' }),
})

export function LoginPage() {
  const { session } = useServices()
  const current = useSession()
  const notice = current.status === 'anonymous' ? current.notice : undefined
  const registered = (useLocation().state as Partial<RegisteredState> | null)?.registered
  const [submitted, setSubmitted] = useState(false)
  const { error, run } = useApiAction()
  const form = useForm({
    resolver: zodResolver(schema),
    defaultValues: { email: '', password: '' },
  })
  const signIn = useRef<HTMLButtonElement>(null)

  function fillWith({ email, password }: DemoAccount) {
    const options = { shouldDirty: true, shouldTouch: true, shouldValidate: true }
    form.setValue('email', email, options)
    form.setValue('password', password, options)
    signIn.current?.focus()
  }

  return (
    <section aria-labelledby="login-title">
      <h1 id="login-title" className="text-2xl font-bold text-ink">Sign in</h1>
      <p className="mt-1.5 text-ink-3 text-pretty">Use the email and password you registered with.</p>
      {notice && <Notice tone="warning" className="mt-6">{notice}</Notice>}
      {registered && !submitted && <Notice tone="success" className="mt-6">Account created for {registered}. Sign in to continue.</Notice>}
      <form className="mt-7 grid gap-4 has-[[data-api-error]]:animate-shake" noValidate onSubmit={form.handleSubmit((values) => {
          setSubmitted(true)
          return run(() => session.login(values))
        })}>
        <TextField form={form} name="email" label="Email" type="email" autoComplete="email" placeholder="you@company.com" />
        <TextField form={form} name="password" label="Password" type="password" autoComplete="current-password" />
        {error && <ApiErrorNote error={error} />}
        <SubmitButton ref={signIn} pending={form.formState.isSubmitting}>
          Sign in
        </SubmitButton>
      </form>
      {demoAccountsShown() && <DemoAccounts onUse={fillWith} />}
      <p className="mt-6 text-center text-ink-3">
        No account yet? <Link to="/register">Create an account</Link>
      </p>
    </section>
  )
}

function DemoAccounts({ onUse }: { onUse: (account: DemoAccount) => void }) {
  const titleId = useId()
  const [picked, setPicked] = useState<{ email: string; times: number } | null>(null)

  return (
    <section aria-labelledby={titleId} className="mt-6 overflow-hidden rounded-md border border-rule">
      <div className="flex items-baseline justify-between gap-3 border-b border-rule bg-mint px-4 py-2.5">
        <h2 id={titleId} className="text-sm font-bold text-ink-2">
          Demo accounts
        </h2>
        <p className="text-xs text-ink-3">Public, for trying the app</p>
      </div>
      <ul className="divide-y divide-rule">
        {DEMO_ACCOUNTS.map((account) => (
          <li key={account.email} className="relative isolate flex items-center gap-3 py-3 pr-3 pl-4">
            {picked?.email === account.email && (
              <span key={picked.times} aria-hidden className="absolute inset-1 -z-10 animate-lock-brief rounded-sm" />
            )}
            <div className="min-w-0 flex-1">
              <p className="text-sm leading-snug">
                <span className="font-bold text-g900">{account.role}</span>
                <span className="text-ink-3"> · {account.outcome}</span>
              </p>
              <p className="mt-1 font-mono text-xs leading-relaxed text-ink-2">
                <span className="block break-all">{account.email}</span>
                <span className="block break-all">{account.password}</span>
              </p>
            </div>
            <Button
              className={secondaryButton}
              aria-label={`Use the ${account.role.toLowerCase()} account`}
              onClick={() => {
                setPicked((last) => ({ email: account.email, times: (last?.times ?? 0) + 1 }))
                onUse(account)
              }}
            >
              Use
            </Button>
          </li>
        ))}
      </ul>
    </section>
  )
}
