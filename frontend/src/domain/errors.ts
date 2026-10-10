export class ApiError extends Error {
  readonly status: number
  readonly traceId: string

  constructor(status: number, traceId: string, message: string) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.traceId = traceId
  }
}

export class SessionEndedError extends Error {
  constructor() {
    super('The session ended and could not be refreshed.')
    this.name = 'SessionEndedError'
  }
}
