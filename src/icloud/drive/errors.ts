export class NotFoundError extends Error {
  static is(e: Error): e is NotFoundError {
    return e instanceof NotFoundError
  }
  static create(message?: string): NotFoundError {
    return new NotFoundError(message)
  }
}

export class ItemIsNotFolder extends Error {
  // readonly tag = 'ItemIsNotFolder'
  static is(e: Error): e is ItemIsNotFolder {
    return e instanceof ItemIsNotFolder
  }

  static create(message?: string): ItemIsNotFolder {
    return new ItemIsNotFolder(message)
  }
}

export class FolderLikeMissingDetailsError extends Error {
  // readonly tag = 'ItemIsNotFolder'
  static is(e: Error): e is FolderLikeMissingDetailsError {
    return e instanceof FolderLikeMissingDetailsError
  }

  static create(message?: string): FolderLikeMissingDetailsError {
    return new FolderLikeMissingDetailsError(message)
  }
}

export class MissinRootError extends Error {
  static is(e: Error): e is MissinRootError {
    return e instanceof MissinRootError
  }
  static create(message?: string): MissinRootError {
    return new MissinRootError(message)
  }
}
