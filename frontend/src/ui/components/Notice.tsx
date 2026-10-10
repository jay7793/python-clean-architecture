import { CircleCheck, Info } from 'lucide-react'
import type { ReactNode } from 'react'

const TONES = {
  success: { Icon: CircleCheck, className: 'animate-saved border-transparent bg-pear-100 text-g900' },
  warning: { Icon: Info, className: 'animate-drop-notif border-amber-line bg-amber-wash text-amber-text' },
}

type Props = { tone: keyof typeof TONES; children: ReactNode; className?: string }

export function Notice({ tone, children, className = '' }: Props) {
  const { Icon, className: toneClass } = TONES[tone]
  return (
    <div className={`flex gap-2.5 rounded-sm border px-4 py-3 text-sm ${toneClass} ${className}`} role="status">
      <Icon className="mt-0.5 flex-none" size={16} aria-hidden />
      <p>{children}</p>
    </div>
  )
}
