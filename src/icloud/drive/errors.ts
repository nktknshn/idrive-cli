import { fileName, HasName } from './helpers'
import { DriveChildrenItem, DriveChildrenItemFile } from './types'

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

export class ItemIsNotFolder extends Error {
  // readonly tag = 'ItemIsNotFolder'
  static is(e: Error): e is ItemIsNotFolder {
    return e instanceof ItemIsNotFolder
  }

  static create(message?: string): ItemIsNotFolder {
    return new ItemIsNotFolder(message)
  }

  static createTemplate(item: HasName): ItemIsNotFolder {
    return new ItemIsNotFolder(`${item.drivewsid} (${fileName(item)}) is not a folder`)
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
