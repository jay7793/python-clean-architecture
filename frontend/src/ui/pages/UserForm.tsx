import { zodResolver } from '@hookform/resolvers/zod'
import { Controller, useForm } from 'react-hook-form'
import { z } from 'zod'
import { ApiErrorNote } from '../components/ApiErrorNote'
import { card } from '../components/classes'
import { SubmitButton } from '../components/SubmitButton'
import { SwitchField } from '../components/SwitchField'
import { TextField } from '../components/TextField'
import { useApiAction } from '../components/useApiAction'

const fields = {
  first_name: z.string().trim().min(1, { error: 'Enter a first name.' }),
  last_name: z.string().trim().min(1, { error: 'Enter a last name.' }),
  email: z.email({ error: 'Enter a valid email address.' }),
  is_admin: z.boolean(),
}

/** A new user needs a password; on an edit an empty password keeps the current one. */
const SCHEMAS = {
  required: z.object({ ...fields, password: z.string().min(1, { error: 'Set a password for this user.' }) }),
  optional: z.object({ ...fields, password: z.string() }),
}

export type UserFormValues = z.infer<(typeof SCHEMAS)['required']>
export type ChangedFields = Partial<Record<keyof UserFormValues, boolean>>

type Props = {
  defaults: UserFormValues
  password: keyof typeof SCHEMAS
  passwordHint?: string
  adminHint: string
  adminLocked?: boolean
  submitLabel: string
  onSubmit: (values: UserFormValues, changed: ChangedFields) => Promise<void>
}

export function UserForm({ defaults, password, passwordHint, adminHint, adminLocked, submitLabel, onSubmit }: Props) {
  const { error, run } = useApiAction()
  const form = useForm({ resolver: zodResolver(SCHEMAS[password]), defaultValues: defaults })
  const submit = form.handleSubmit((values) => run(() => onSubmit(values, form.formState.dirtyFields)))

  return (
    <form className={`${card} grid w-full max-w-[640px] animate-rise gap-4 p-6 has-[[data-api-error]]:animate-shake sm:p-8`} noValidate onSubmit={submit}>
      <div className="grid gap-4 @lg:grid-cols-2 @lg:gap-3">
        <TextField form={form} name="first_name" label="First name" autoComplete="off" placeholder="Grace" />
        <TextField form={form} name="last_name" label="Last name" autoComplete="off" placeholder="Hopper" />
      </div>
      <TextField form={form} name="email" label="Email" type="email" autoComplete="off" placeholder="grace@company.com" />
      <TextField form={form} name="password" label="Password" type="password" autoComplete="new-password" description={passwordHint} />
      <Controller
        name="is_admin"
        control={form.control}
        render={({ field }) => (
          <SwitchField label="Administrator" description={adminHint} checked={field.value} onCheckedChange={field.onChange} disabled={adminLocked} />
        )}
      />
      {error && <ApiErrorNote error={error} />}
      <SubmitButton pending={form.formState.isSubmitting}>{submitLabel}</SubmitButton>
    </form>
  )
}
