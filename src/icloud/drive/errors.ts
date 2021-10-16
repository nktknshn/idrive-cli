export class NotFoundError extends Error {
  readonly tag = 'NotFoundError'
  static is(e: Error) {
    return e instanceof NotFoundError
  }
  static create(message?: string) {
    return new NotFoundError(message)
  }
}

export class ItemIsNotFolder extends Error {
  readonly tag = 'ItemIsNotFolder'
  static is(e: Error) {
    return e instanceof ItemIsNotFolder
  }
  static create(message?: string) {
    return new ItemIsNotFolder(message)
  }
}
