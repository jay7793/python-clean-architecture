import { createContext, useContext, useSyncExternalStore, type ReactNode } from 'react'
import type { ExchangeLog } from '../application/exchangeLog'
import type { SessionController } from '../application/session'
import type { Exchange } from '../domain/exchange'
import type { Session } from '../domain/session'
import type { TokenClaims } from '../domain/token'

export type Services = {
  session: SessionController
  exchanges: ExchangeLog
  decodeClaims: (token: string) => TokenClaims | null
}

const ServicesContext = createContext<Services | null>(null)

export function ServicesProvider({ services, children }: { services: Services; children: ReactNode }) {
  return <ServicesContext value={services}>{children}</ServicesContext>
}

export function useServices(): Services {
  const services = useContext(ServicesContext)
  if (!services) throw new Error('useServices needs a ServicesProvider')
  return services
}

export function useSession(): Session {
  const { session } = useServices()
  return useSyncExternalStore(
    (listener) => session.subscribe(listener),
    () => session.getSession(),
  )
}

export function useExchanges(): readonly Exchange[] {
  const { exchanges } = useServices()
  return useSyncExternalStore(
    (listener) => exchanges.subscribe(listener),
    () => exchanges.list(),
  )
}
