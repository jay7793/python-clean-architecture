import type { Exchange } from '../domain/exchange'
import type { Clock, ExchangeRecorder, OpenExchange } from './ports'

export class ExchangeLog implements ExchangeRecorder {
  private exchanges: readonly Exchange[] = []
  private readonly listeners = new Set<() => void>()
  private readonly clock: Clock
  private readonly capacity: number

  constructor(clock: Clock, capacity = 40) {
    this.clock = clock
    this.capacity = capacity
  }

  open(exchange: OpenExchange): void {
    this.publish([...this.exchanges, { ...exchange, startedAt: this.clock.now() }].slice(-this.capacity))
  }

  close(id: string, status: number, traceId?: string): void {
    this.publish(this.exchanges.map((e) => (e.id === id ? { ...e, status, ...(traceId && { traceId }) } : e)))
  }

  discard(id: string): void {
    this.publish(this.exchanges.filter((e) => e.id !== id))
  }

  clear(): void {
    this.publish([])
  }

  list(): readonly Exchange[] {
    return this.exchanges
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  private publish(next: readonly Exchange[]): void {
    this.exchanges = next
    for (const listener of this.listeners) listener()
  }
}
