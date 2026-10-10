import { zodResolver } from '@hookform/resolvers/zod'
import { useForm } from 'react-hook-form'
import { Link, useNavigate } from 'react-router'
import { z } from 'zod'
import { ApiErrorNote } from '../components/ApiErrorNote'
import { SubmitButton } from '../components/SubmitButton'
import { TextField } from '../components/TextField'
import { useApiAction } from '../components/useApiAction'
import { useServices } from '../services'

const schema = z.object({
  first_name: z.string().trim().min(1, { error: 'Enter your first name.' }),
  last_name: z.string().trim().min(1, { error: 'Enter your last name.' }),
  email: z.email({ error: 'Enter a valid email address.' }),
  password: z.string().min(1, { error: 'Choose a password.' }),
})

export type RegisteredState = { registered: string }

export function RegisterPage() {
  const { session } = useServices()
  const navigate = useNavigate()
  const { error, run } = useApiAction()
  const form = useForm({
    resolver: zodResolver(schema),
    defaultValues: { first_name: '', last_name: '', email: '', password: '' },
  })

  const submit = form.handleSubmit((values) =>
    run(async () => {
      const user = await session.register(values)
      const state: RegisteredState = { registered: user.email }
      navigate('/login', { state })
    }),
  )

  return (
    <section aria-labelledby="register-title">
      <h1 id="register-title" className="text-2xl font-bold text-ink">Create an account</h1>
      <p className="mt-1.5 text-ink-3 text-pretty">Creating an account does not sign you in. You sign in on the next screen.</p>
      <form className="mt-7 grid gap-4 has-[[data-api-error]]:animate-shake" noValidate onSubmit={submit}>
        <div className="grid gap-4 sm:grid-cols-2 sm:gap-3">
          <TextField form={form} name="first_name" label="First name" autoComplete="given-name" placeholder="Ada" />
          <TextField form={form} name="last_name" label="Last name" autoComplete="family-name" placeholder="Lovelace" />
        </div>
        <TextField form={form} name="email" label="Email" type="email" autoComplete="email" placeholder="you@company.com" />
        <TextField form={form} name="password" label="Password" type="password" autoComplete="new-password" />
        {error && <ApiErrorNote error={error} />}
        <SubmitButton pending={form.formState.isSubmitting}>Create account</SubmitButton>
      </form>
      <p className="mt-6 text-center text-ink-3">
        Already have an account? <Link to="/login">Sign in</Link>
      </p>
    </section>
  )
}
