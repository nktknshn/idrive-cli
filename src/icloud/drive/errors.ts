import { DriveChildrenItem, DriveChildrenItemFile, fileName, HasName } from './types'

export class NotFoundError extends Error {
  static is(e: Error): e is NotFoundError {
    return e instanceof NotFoundError
  }

  static create(message?: string): NotFoundError {
    return new NotFoundError(message)
  }

  static createTemplate(target: string, container: string, prefix?: string): NotFoundError {
    return new NotFoundError(`${prefix ? prefix + ': ' : ''}${target} was not found in ${container}`)
  }
}

export class ItemIsNotFolderError extends Error {
  static is(e: Error): e is ItemIsNotFolderError {
    return e instanceof ItemIsNotFolderError
  }

  static create(message?: string): ItemIsNotFolderError {
    return new ItemIsNotFolderError(message)
  }

  static createTemplate(item: HasName): ItemIsNotFolderError {
    return new ItemIsNotFolderError(`${item.drivewsid} (${fileName(item)}) is not a folder`)
  }
}

export class ItemIsNotFileError extends Error {
  static is(e: Error): e is ItemIsNotFileError {
    return e instanceof ItemIsNotFileError
  }

  static create(message?: string): ItemIsNotFileError {
    return new ItemIsNotFileError(message)
  }

  static createTemplate(item: HasName): ItemIsNotFileError {
    return new ItemIsNotFileError(`${item.drivewsid} (${fileName(item)}) is not a file`)
  }
}

export class FolderLikeMissingDetailsError extends Error {
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
