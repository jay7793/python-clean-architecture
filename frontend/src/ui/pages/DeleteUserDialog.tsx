import { AlertDialog } from '@base-ui/react/alert-dialog'
import { Button } from '@base-ui/react/button'
import { LoaderCircle, Trash2 } from 'lucide-react'
import { useId, useState } from 'react'
import { useNavigate } from 'react-router'
import type { UserOverview } from '../../domain/user'
import { ApiErrorNote } from '../components/ApiErrorNote'
import { dangerButton, dialogBackdrop, dialogPopup, secondaryButton, solidDangerButton } from '../components/classes'
import { SELF_DELETE_COPY } from '../components/errorCopy'
import { useApiAction } from '../components/useApiAction'
import { useServices, useSession } from '../services'
import type { ListState } from './UsersPage'

/** `lockedBy` is the id of the line saying why Delete is off; a protected account passes it. */
export function DeleteUserDialog({ user, back, lockedBy }: { user: UserOverview; back: string; lockedBy?: string }) {
  const { session } = useServices()
  const current = useSession()
  const navigate = useNavigate()
  const { error, run } = useApiAction()
  const [pending, setPending] = useState(false)
  const reasonId = useId()
  const self = current.status === 'authenticated' && current.user.id === user.id
  const describedBy = lockedBy ?? (self ? reasonId : undefined)
  const name = `${user.first_name} ${user.last_name}`

  async function confirm() {
    setPending(true)
    await run(async () => {
      await session.deleteUser(user.id)
      const state: ListState = { notice: `Deleted ${name} (${user.email}).`, deleted: user }
      navigate(back, { state })
    })
    setPending(false)
  }

  return (
    <>
      <AlertDialog.Root>
        <AlertDialog.Trigger className={dangerButton} disabled={describedBy !== undefined} aria-describedby={describedBy}>
          <Trash2 size={15} aria-hidden />
          Delete
        </AlertDialog.Trigger>
        <AlertDialog.Portal>
          <AlertDialog.Backdrop className={dialogBackdrop} />
          <AlertDialog.Popup className={dialogPopup}>
            <AlertDialog.Title className="text-lg leading-snug font-bold text-balance text-ink">Delete {name}?</AlertDialog.Title>
            <AlertDialog.Description className="mt-1.5 text-pretty text-ink-2">
              This removes their account and ends their session.
            </AlertDialog.Description>
            {error && (
              <div className="mt-4">
                <ApiErrorNote error={error} />
              </div>
            )}
            <div className="mt-6 flex flex-wrap justify-end gap-2">
              <AlertDialog.Close className={`${secondaryButton} h-10 px-5`}>Cancel</AlertDialog.Close>
              <Button className={solidDangerButton} onClick={confirm} disabled={pending} focusableWhenDisabled aria-busy={pending}>
                {pending && <LoaderCircle className="animate-spin" size={16} aria-hidden />}
                Delete user
              </Button>
            </div>
          </AlertDialog.Popup>
        </AlertDialog.Portal>
      </AlertDialog.Root>
      {self && !lockedBy && (
        <p id={reasonId} className="text-sm text-ink-3">
          {SELF_DELETE_COPY}
        </p>
      )}
    </>
  )
}
