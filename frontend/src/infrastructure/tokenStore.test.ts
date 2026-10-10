import { describe, expect, it } from 'vitest'
import { localStorageTokenStore } from './tokenStore'

const pair = { access: 'a.b.c', refresh: 'd.e.f' }

describe('localStorageTokenStore', () => {
  it('round-trips a token pair through storage and forgets it on clear', () => {
    const store = localStorageTokenStore(localStorage)

    store.save(pair)
    expect(localStorageTokenStore(localStorage).load()).toEqual(pair)

    store.clear()
    expect(store.load()).toBeNull()
  })

  it('tells subscribers what another tab saved or cleared under its key, and nothing else', () => {
    const store = localStorageTokenStore(localStorage, window)
    const seen: unknown[] = []
    const unsubscribe = store.subscribe((tokens) => seen.push(tokens))
    const fromOtherTab = (key: string, newValue: string | null) =>
      window.dispatchEvent(new StorageEvent('storage', { key, newValue, storageArea: localStorage }))

    fromOtherTab('session.tokens', JSON.stringify(pair))
    fromOtherTab('unrelated', 'x')
    fromOtherTab('session.tokens', null)
    unsubscribe()
    fromOtherTab('session.tokens', JSON.stringify(pair))

    expect(seen).toEqual([pair, null])
  })

  it.each(['not json', '{"access":"only"}', '[]', 'null'])('treats unreadable stored value %s as no session', (raw) => {
    localStorage.setItem('session.tokens', raw)

    expect(localStorageTokenStore(localStorage).load()).toBeNull()
  })
})
