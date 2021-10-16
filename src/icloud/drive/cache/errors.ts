export class InconsistentCache extends Error {
  static is(e: Error): e is InconsistentCache {
    return e instanceof InconsistentCache
  }
  constructor(message?: string) {
    super(message)
  }
  static create(message?: string): InconsistentCache {
    return new InconsistentCache(message)
  }
}

export class MissingParentError extends InconsistentCache {
  constructor(message?: string) {
    super(message)
  }
  static create(message?: string): MissingParentError {
    return new MissingParentError(message)
  }
}
