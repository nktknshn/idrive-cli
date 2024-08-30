import * as E from 'fp-ts/Either'
import * as A from 'fp-ts/lib/Array'
import { Eq } from 'fp-ts/lib/Eq'
import { flow, pipe } from 'fp-ts/lib/function'
import * as NA from 'fp-ts/lib/NonEmptyArray'
import * as O from 'fp-ts/lib/Option'
import { NormalizedPath, normalizePath } from '../../util/normalize-path'
import { NEA } from '../../util/types'
import * as T from '../drive-types'

/** Chain of details, R is the root type */
export type Hierarchy<R> = [R, ...T.NonRootDetails[]]

export type PathValid<R> = PathValidFile<R> | PathValidFolder<R>

export type PathValidFile<R> = {
  valid: true
  folder: false
  details: Hierarchy<R>
  file: T.DriveChildrenItemFile
}

export type PathValidFolder<R> = {
  valid: true
  folder: true
  details: Hierarchy<R>
}

export type PathInvalid<R> = {
  valid: false
  details: Hierarchy<R>
  rest: NEA<string>
  error: Error
}

export type PathValidation<R> =
  | PathValidFolder<R>
  | PathValidFile<R>
  | PathInvalid<R>

export type Result<R extends T.Root> = PathValidation<R>
export type ResultRoot = PathValidation<T.DetailsDocwsRoot>

export const containsInvalidPath = <R>(res: Array<PathValidation<R>>): boolean => pipe(res, A.some(isInvalidPath))

export const tail = <R>([, ...tail]: Hierarchy<R>): T.NonRootDetails[] => tail
export const root = <R>([root]: Hierarchy<R>): R => root

export function pathString<R>(res: PathValidation<R>): string {
  const elements = [...tail(res.details).map(T.fileName)]

  if (res.valid === false) {
    elements.push(...res.rest)
  }

  return elements.join('/')
}

export function pathTarget<R>(
  res: PathValidFile<R>,
): T.DriveChildrenItemFile
export function pathTarget<R>(
  res: PathValidFolder<R>,
): R | T.DetailsFolder | T.DetailsAppLibrary
export function pathTarget<R>(
  res: PathValid<R>,
): R | T.DetailsFolder | T.DetailsAppLibrary | T.DriveChildrenItemFile
export function pathTarget<R>(
  res: PathValid<R>,
): R | T.DetailsFolder | T.DetailsAppLibrary | T.DriveChildrenItemFile {
  if (isValidFile(res)) {
    return res.file
  }
  else {
    return NA.last(res.details)
  }
}

export function isValidFile<R>(res: PathValid<R>): res is PathValidFile<R>
export function isValidFile<R>(res: PathValidation<R>): res is PathValidFile<R>
export function isValidFile<R>(res: PathValidation<R>): res is PathValidFile<R> {
  return res.valid === true && res.folder === false
}

export function isValidFolder<R>(res: PathValid<R>): res is PathValidFolder<R>
export function isValidFolder<R>(res: PathValidation<R>): res is PathValidFolder<R>
export function isValidFolder<R>(res: PathValidation<R>): res is PathValidFolder<R> {
  return res.valid === true && res.folder === true
}

export const isValidPath = <R>(res: PathValidation<R>): res is PathValid<R> => {
  return res.valid === true
}

export const isInvalidPath = <R>(res: PathValidation<R>): res is PathInvalid<R> => {
  return res.valid === false
}

export const validPath = <R>(
  path: Hierarchy<R>,
  file: O.Option<T.DriveChildrenItemFile> = O.none,
): PathValid<R> => O.isSome(file) ? validFile(path, file.value) : validFolder(path)

export const validFile = <R>(
  path: Hierarchy<R>,
  file: T.DriveChildrenItemFile,
): PathValidFile<R> => ({
  valid: true,
  details: path,
  folder: false,
  file,
})

export const validFolder = <R>(
  path: Hierarchy<R>,
): PathValidFolder<R> => ({
  valid: true,
  folder: true,
  details: path,
})

export const invalidPath = <R>(
  details: Hierarchy<R>,
  rest: NEA<string>,
  error: Error,
): PathInvalid<R> => ({
  valid: false,
  rest,
  details,
  error,
})

export function getFile<R>(res: PathValid<R>): O.Option<T.DriveChildrenItemFile> {
  return isValidFile(res) ? O.some(res.file) : O.none
}

export const getFolder = <R>(res: PathValidFolder<R>): T.DetailsFolder | T.DetailsAppLibrary | R => pathTarget(res)

export const showGetByPathResult = <R extends T.Root>(p: PathValidation<R>): string => {
  if (p.valid === true) {
    return `valid: ${p.details.map(T.fileName)} file: ${pipe(getFile(p), O.fold(() => `none`, T.fileName))}`
  }
  // ${p.error.message}
  return `invalid (). valid part ${p.details.map(T.fileName)}, rest: ${p.rest}`
}

export const validAsString = <R extends T.Root>(
  result: PathValid<R>,
): NormalizedPath => {
  return normalizePath(
    [
      ...result.details.map(T.fileName),
      ...pipe(getFile(result), O.fold(() => [], flow(T.fileName, A.of))),
    ].join('/'),
  )
}

export const concat = <R>(h: Hierarchy<R>, details: NEA<T.Details>): Hierarchy<R> => [...h, ...details] as Hierarchy<R>

export const eq = <R extends T.Root>(): Eq<Hierarchy<R>> => ({
  equals: (a, b) => {
    if (a.length !== b.length) {
      return false
    }

    return pipe(
      A.zip(a, b),
      A.every(([a, b]) => isSameDetails(a, b)),
    )
  },
})

export const isSameDetails = (a: T.Details, b: T.Details): boolean => {
  if (a.drivewsid !== b.drivewsid) {
    return false
  }

  if (T.isRegularDetails(a) && T.isRegularDetails(b)) {
    if (a.parentId !== b.parentId) {
      return false
    }
  }

  if (T.hasName(a) && T.hasName(b)) {
    return T.fileName(a) == T.fileName(b)
  }

  return true
}

export const asEither = <R extends T.Root, E>(
  onLeft: (path: PathInvalid<R>) => E,
): (
  path: Result<R>,
) => E.Either<E, R | T.DetailsFolder | T.DetailsAppLibrary | T.DriveChildrenItemFile> =>
  (path: Result<R>) => {
    return path.valid === true ? E.of(pathTarget(path)) : E.left(onLeft(path))
  }
