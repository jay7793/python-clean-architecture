import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router'
import { ExchangeLog } from './application/exchangeLog'
import { SessionController } from './application/session'
import { createHttpAuthApi } from './infrastructure/http/authApi'
import { decodeClaims } from './infrastructure/jwt'
import { localStorageTokenStore } from './infrastructure/tokenStore'
import { App } from './ui/App'
import './ui/styles/app.css'

const root = document.getElementById('root')
if (!root) throw new Error('missing #root element')

const exchanges = new ExchangeLog({ now: () => Date.now() })
const api = createHttpAuthApi({ baseUrl: import.meta.env.VITE_API_URL ?? 'http://localhost:3000', recorder: exchanges })
const session = new SessionController({ api, store: localStorageTokenStore(localStorage) })
void session.start()

createRoot(root).render(
  <StrictMode>
    <BrowserRouter>
      <App services={{ session, exchanges, decodeClaims }} />
    </BrowserRouter>
  </StrictMode>,
)
