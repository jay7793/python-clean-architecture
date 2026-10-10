import { AlertDialog } from '@base-ui/react/alert-dialog'
import { Button } from '@base-ui/react/button'
import { LoaderCircle, LogOut } from 'lucide-react'
import { useState } from 'react'
import type { UserOverview } from '../../domain/user'
import { ApiErrorNote } from '../components/ApiErrorNote'
import { dialogBackdrop, dialogPopup, secondaryButton, solidDangerButton } from '../components/classes'
import { useApiAction } from '../components/useApiAction'
import { useServices } from '../services'

export const REVOKE_CONSEQUENCE = 'Their next request will need a new sign-in.'

type Props = { user: UserOverview; onRevoked: (fresh: UserOverview) => void; lockedBy?: string }

/**
 * Ends another user's session, then hands back their overview as the API reads it now.
 * `lockedBy` is the id of the line saying why the action is off; a protected account passes it.
 */
export function RevokeSessionDialog({ user, onRevoked, lockedBy }: Props) {
  const { session } = useServices()
  const { error, run } = useApiAction()
  const [open, setOpen] = useState(false)
  const [pending, setPending] = useState(false)
  const name = `${user.first_name} ${user.last_name}`

  async function confirm() {
    setPending(true)
    await run(async () => {
      await session.revokeUserSession(user.id)
      const fresh = await session.getUserOverview(user.id)
      setOpen(false)
      onRevoked(fresh)
    })
    setPending(false)
  }

  return (
    <AlertDialog.Root open={open} onOpenChange={setOpen}>
      <AlertDialog.Trigger className={secondaryButton} disabled={lockedBy !== undefined} aria-describedby={lockedBy}>
        <LogOut size={15} aria-hidden />
        Revoke session
      </AlertDialog.Trigger>
      <AlertDialog.Portal>
        <AlertDialog.Backdrop className={dialogBackdrop} />
        <AlertDialog.Popup className={dialogPopup}>
          <AlertDialog.Title className="text-lg leading-snug font-bold text-balance text-ink">Sign {name} out?</AlertDialog.Title>
          <AlertDialog.Description className="mt-1.5 text-pretty text-ink-2">{REVOKE_CONSEQUENCE}</AlertDialog.Description>
          {error && (
            <div className="mt-4">
              <ApiErrorNote error={error} />
            </div>
          )}
          <div className="mt-6 flex flex-wrap justify-end gap-2">
            <AlertDialog.Close className={`${secondaryButton} h-10 px-5`}>Cancel</AlertDialog.Close>
            <Button className={solidDangerButton} onClick={confirm} disabled={pending} focusableWhenDisabled aria-busy={pending}>
              {pending && <LoaderCircle className="animate-spin" size={16} aria-hidden />}
              Sign out {name}
            </Button>
          </div>
        </AlertDialog.Popup>
      </AlertDialog.Portal>
    </AlertDialog.Root>
  )
}
