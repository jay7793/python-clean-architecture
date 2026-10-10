import { Button } from '@base-ui/react/button'
import { LoaderCircle } from 'lucide-react'
import type { ReactNode, Ref } from 'react'
import { primaryButton } from './classes'

type Props = { pending: boolean; children: ReactNode; ref?: Ref<HTMLButtonElement> }

export function SubmitButton({ pending, children, ref }: Props) {
  return (
    <Button
      ref={ref}
      className={`${primaryButton} mt-1 w-full aria-busy:cursor-progress`}
      type="submit"
      disabled={pending}
      focusableWhenDisabled
      aria-busy={pending}
    >
      {pending && <LoaderCircle className="animate-spin" size={18} aria-hidden />}
      {children}
    </Button>
  )
}
