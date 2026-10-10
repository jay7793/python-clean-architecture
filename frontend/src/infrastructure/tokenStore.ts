import type { TokenStore } from '../application/ports'
import type { TokenPair } from '../domain/user'

function parseTokenPair(raw: string | null): TokenPair | null {
  if (raw === null) return null
  try {
    const value: unknown = JSON.parse(raw)
    if (typeof value !== 'object' || value === null) return null
    const { access, refresh } = value as Record<string, unknown>
    return typeof access === 'string' && typeof refresh === 'string' ? { access, refresh } : null
  } catch {
    return null
  }
}

export function localStorageTokenStore(storage: Storage, tabs: Window = window, key = 'session.tokens'): TokenStore {
  return {
    load: () => parseTokenPair(storage.getItem(key)),
    save: (tokens) => storage.setItem(key, JSON.stringify(tokens)),
    clear: () => storage.removeItem(key),
    subscribe(listener) {
      const onStorage = (event: StorageEvent) => {
        if (event.storageArea === storage && event.key === key) listener(parseTokenPair(event.newValue))
      }
      tabs.addEventListener('storage', onStorage)
      return () => tabs.removeEventListener('storage', onStorage)
    },
  }
}
