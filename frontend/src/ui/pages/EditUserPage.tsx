import { Navigate, useLocation, useNavigate, useParams } from 'react-router'
import type { AccountChanges, AdminUser } from '../../domain/user'
import { AdminRequired } from '../components/AdminRequired'
import { ApiErrorNote } from '../components/ApiErrorNote'
import { card } from '../components/classes'
import { SELF_DEMOTE_COPY } from '../components/errorCopy'
import { useApiLoad } from '../components/useApiLoad'
import { usePageTitle } from '../layout/pageTitle'
import { useServices, useSession } from '../services'
import { UserForm, type ChangedFields, type UserFormValues } from './UserForm'
import { BackLink, CardSkeleton, NotFound, USERS_LIST, type UserPageState } from './UserDetailPage'

export function EditUserPage() {
  const id = Number(useParams().id)
  if (!Number.isInteger(id) || id < 1) return <Navigate to={USERS_LIST} replace />
  return <EditUser key={id} id={id} />
}

function EditUser({ id }: { id: number }) {
  const { session } = useServices()
  const load = useApiLoad(`admin-users:${id}`, (signal) => session.getAdminUser(id, signal))
  const list = (useLocation().state as UserPageState | null)?.list ?? USERS_LIST
  const detail = `/users/${id}`
  usePageTitle(load.status === 'loaded' ? `Edit ${load.value.first_name} ${load.value.last_name}` : `Edit user ${id}`)

  if (load.status === 'failed' && load.error.status === 404) return <NotFound id={id} error={load.error} back={list} />
  return (
    <div className="grid gap-5">
      <BackLink to={detail} state={{ list }} label="Back to user" />
      {load.status === 'loading' && <CardSkeleton />}
      {load.status === 'loaded' && <EditForm user={load.value} list={list} />}
      {load.status === 'forbidden' && (
        <div className={`${card} overflow-hidden`}>
          <AdminRequired error={load.error} />
        </div>
      )}
      {load.status === 'failed' && (
        <div className={`${card} p-5`}>
          <ApiErrorNote error={load.error} />
        </div>
      )}
    </div>
  )
}

function EditForm({ user, list }: { user: AdminUser; list: string }) {
  const { session } = useServices()
  const current = useSession()
  const navigate = useNavigate()
  const self = current.status === 'authenticated' && current.user.id === user.id

  async function save(values: UserFormValues, changed: ChangedFields) {
    const changes = changesFrom(values, changed)
    const saved = await session.updateUser(user.id, changes)
    const signedOut = changes.password !== undefined || saved.email !== user.email
    const state: UserPageState = {
      list,
      notice: `Saved ${saved.first_name} ${saved.last_name}.${signedOut ? ' Their session ended, so they sign in again with the new details.' : ''}`,
    }
    navigate(`/users/${user.id}`, { state })
  }

  return (
    <UserForm
      defaults={{ first_name: user.first_name, last_name: user.last_name, email: user.email, password: '', is_admin: user.is_admin }}
      password="optional"
      passwordHint={
        self
          ? 'Leave empty to keep your current password. A new password signs you out here too.'
          : 'Leave empty to keep the current password. A new password signs this user out.'
      }
      adminHint={self ? SELF_DEMOTE_COPY : 'Administrators manage users and read the audit log.'}
      adminLocked={self}
      submitLabel="Save changes"
      onSubmit={save}
    />
  )
}

/** Only the fields the admin touched go to the API; an empty password means keep the current one. */
function changesFrom(values: UserFormValues, changed: ChangedFields): AccountChanges {
  return {
    ...(changed.first_name && { first_name: values.first_name }),
    ...(changed.last_name && { last_name: values.last_name }),
    ...(changed.email && { email: values.email }),
    ...(changed.is_admin && { is_admin: values.is_admin }),
    ...(values.password && { password: values.password }),
  }
}
