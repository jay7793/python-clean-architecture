import { useNavigate } from 'react-router'
import { usePageTitle } from '../layout/pageTitle'
import { useServices } from '../services'
import { UserForm } from './UserForm'
import { BackLink, USERS_LIST, type UserPageState } from './UserDetailPage'

const EMPTY = { first_name: '', last_name: '', email: '', password: '', is_admin: false }

export function NewUserPage() {
  const { session } = useServices()
  const navigate = useNavigate()
  usePageTitle('New user')

  return (
    <div className="grid gap-5">
      <BackLink to={USERS_LIST} />
      <UserForm
        defaults={EMPTY}
        password="required"
        adminHint="Administrators manage users and read the audit log."
        submitLabel="Create user"
        onSubmit={async (values) => {
          const created = await session.createUser(values)
          const state: UserPageState = {
            list: USERS_LIST,
            created: true,
            notice: `Created ${created.first_name} ${created.last_name}. They can sign in with ${created.email} and the password you set.`,
          }
          navigate(`/users/${created.id}`, { state })
        }}
      />
    </div>
  )
}
