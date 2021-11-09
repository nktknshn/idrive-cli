export class NotFoundError extends Error {
  readonly tag = 'NotFoundError'
  static is(e: Error): e is NotFoundError {
    return e instanceof NotFoundError
  }
  static create(message?: string): NotFoundError {
    return new NotFoundError(message)
  }
}

export class ItemIsNotFolder extends Error {
  readonly tag = 'ItemIsNotFolder'
  static is(e: Error): e is ItemIsNotFolder {
    return e instanceof ItemIsNotFolder
  }

  static create(message?: string): ItemIsNotFolder {
    return new ItemIsNotFolder(message)
  }
}
