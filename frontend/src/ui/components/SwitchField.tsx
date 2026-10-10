import { Field } from '@base-ui/react/field'
import { Switch } from '@base-ui/react/switch'

type Props = {
  label: string
  description: string
  checked: boolean
  onCheckedChange: (checked: boolean) => void
  disabled?: boolean
}

export function SwitchField({ label, description, checked, onCheckedChange, disabled = false }: Props) {
  return (
    <Field.Root
      className="flex items-center justify-between gap-4 rounded-sm border border-g200 px-4 py-3 transition-colors data-[disabled]:border-rule data-[disabled]:bg-mint"
      disabled={disabled}
    >
      <div className="grid min-w-0 gap-0.5">
        <Field.Label className="text-sm font-bold text-ink-2">{label}</Field.Label>
        <Field.Description className="text-sm text-pretty text-ink-3">{description}</Field.Description>
      </div>
      <Switch.Root
        checked={checked}
        onCheckedChange={onCheckedChange}
        className="relative inline-flex h-7 w-12 flex-none cursor-pointer items-center rounded-full bg-g200 p-0.5 transition-colors duration-200 focus-visible:outline-offset-3 data-[checked]:bg-g600 data-[disabled]:cursor-not-allowed data-[disabled]:opacity-60"
      >
        <Switch.Thumb className="size-6 rounded-full bg-white shadow-sm transition-transform duration-300 ease-pop data-[checked]:translate-x-5" />
      </Switch.Root>
    </Field.Root>
  )
}
