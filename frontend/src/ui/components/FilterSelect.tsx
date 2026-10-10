import { Select } from '@base-ui/react/select'
import { Check, ChevronsUpDown } from 'lucide-react'
import { filterControl, filterLabel } from './classes'

type FilterSelectProps = {
  label: string
  className: string
  items: { value: string; label: string }[]
  value: string
  /** Null when the select is cleared. */
  onChange: (value: string | null) => void
}

export function FilterSelect({ label, className, items, value, onChange }: FilterSelectProps) {
  return (
    <div className={`grid gap-1.5 ${className}`}>
      <Select.Root items={items} value={value} onValueChange={onChange}>
        <Select.Label className={filterLabel}>{label}</Select.Label>
        <Select.Trigger className={`${filterControl} flex cursor-pointer items-center justify-between gap-2 text-left data-[popup-open]:border-g600`}>
          <Select.Value className="truncate" />
          <Select.Icon className="flex-none text-g300">
            <ChevronsUpDown size={16} aria-hidden />
          </Select.Icon>
        </Select.Trigger>
        <Select.Portal>
          <Select.Positioner sideOffset={6} alignItemWithTrigger={false} className="z-30 outline-none">
            <Select.Popup className="max-h-[var(--available-height)] min-w-[var(--anchor-width)] origin-[var(--transform-origin)] overflow-y-auto rounded-md border border-rule bg-white p-1.5 shadow-lg transition-[opacity,scale] duration-200 ease-pop data-[ending-style]:scale-95 data-[ending-style]:opacity-0 data-[starting-style]:scale-95 data-[starting-style]:opacity-0">
              <Select.List>
                {items.map((item) => (
                  <Select.Item
                    key={item.value}
                    value={item.value}
                    className="grid h-9 cursor-pointer grid-cols-[16px_1fr] items-center gap-2 rounded-sm px-2.5 text-sm text-ink-2 outline-none select-none data-[highlighted]:bg-mint data-[highlighted]:text-g900 data-[selected]:font-bold data-[selected]:text-g900"
                  >
                    <Select.ItemIndicator className="text-g600">
                      <Check size={14} aria-hidden />
                    </Select.ItemIndicator>
                    <Select.ItemText className="col-start-2 whitespace-nowrap">{item.label}</Select.ItemText>
                  </Select.Item>
                ))}
              </Select.List>
            </Select.Popup>
          </Select.Positioner>
        </Select.Portal>
      </Select.Root>
    </div>
  )
}
