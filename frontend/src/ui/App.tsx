import { Navigate, Route, Routes } from 'react-router'
import { Shell } from './layout/Shell'
import { AuditLogPage } from './pages/AuditLogPage'
import { EditUserPage } from './pages/EditUserPage'
import { LoginPage } from './pages/LoginPage'
import { NewUserPage } from './pages/NewUserPage'
import { ProfilePage } from './pages/ProfilePage'
import { RegisterPage } from './pages/RegisterPage'
import { UserDetailPage } from './pages/UserDetailPage'
import { UsersPage } from './pages/UsersPage'
import { GuestOnly, RequireSession } from './routes/guards'
import { ServicesProvider, type Services } from './services'

export function App({ services }: { services: Services }) {
  return (
    <ServicesProvider services={services}>
      <Routes>
        <Route element={<Shell />}>
          <Route element={<GuestOnly />}>
            <Route path="/login" element={<LoginPage />} />
            <Route path="/register" element={<RegisterPage />} />
          </Route>
          <Route element={<RequireSession />}>
            <Route path="/profile" element={<ProfilePage />} />
            <Route path="/users" element={<UsersPage />} />
            <Route path="/users/new" element={<NewUserPage />} />
            <Route path="/users/:id" element={<UserDetailPage />} />
            <Route path="/users/:id/edit" element={<EditUserPage />} />
            <Route path="/audit-log" element={<AuditLogPage />} />
          </Route>
          <Route path="*" element={<Navigate to="/profile" replace />} />
        </Route>
      </Routes>
    </ServicesProvider>
  )
}
