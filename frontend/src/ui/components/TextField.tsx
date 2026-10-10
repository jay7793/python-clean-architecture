import { Field } from '@base-ui/react/field'
import { Controller, type FieldValues, type Path, type UseFormReturn } from 'react-hook-form'

type Props<T extends FieldValues> = {
  form: Pick<UseFormReturn<T>, 'control' | 'trigger'>
  name: Path<T>
  label: string
  type?: 'text' | 'email' | 'password'
  autoComplete: string
  description?: string
  placeholder?: string
}

export function TextField<T extends FieldValues>({ form: { control, trigger }, name, label, type = 'text', autoComplete, description, placeholder }: Props<T>) {
  return (
    <Controller
      name={name}
      control={control}
      render={({ field: { ref, name, value, onBlur, onChange }, fieldState: { invalid, isTouched, isDirty, error } }) => (
        <Field.Root className="grid gap-1.5" name={name} invalid={invalid} touched={isTouched} dirty={isDirty}>
          <Field.Label className="text-sm font-bold text-ink-2">{label}</Field.Label>
          <Field.Control
            className="h-12 w-full rounded-sm border border-g200 bg-white px-4 text-ink placeholder:text-ink-3 transition-[border-color,box-shadow] duration-200 outline-none hover:border-g300 focus-visible:border-g600 focus-visible:shadow-[0_0_0_4px_rgb(60_122_69/0.16)] data-[valid]:animate-settle data-[valid]:border-g300 data-[invalid]:border-danger data-[invalid]:focus-visible:shadow-[0_0_0_4px_rgb(192_57_47/0.14)] autofill:shadow-[inset_0_0_0_1000px_var(--color-white)] autofill:[-webkit-text-fill-color:var(--color-ink)] autofill:focus-visible:shadow-[inset_0_0_0_1000px_var(--color-white),0_0_0_4px_rgb(60_122_69/0.16)]"
            ref={ref}
            type={type}
            autoComplete={autoComplete}
            placeholder={placeholder}
            value={value}
            onBlur={async () => {
              // The form validates on submit. Leaving a field checks it only once something was typed, so
              // clicking through an empty field stays quiet.
              if (isDirty) await trigger(name)
              onBlur()
            }}
            onValueChange={(next) => {
              onChange(next)
              if (invalid) trigger(name)
            }}
            data-valid={(isTouched && isDirty && !invalid) || undefined}
          />
          {description && <Field.Description className="text-sm text-ink-3">{description}</Field.Description>}
          <Field.Error className="animate-drop text-sm text-danger" match={!!error}>
            {error?.message}
          </Field.Error>
        </Field.Root>
      )}
    />
  )
}
