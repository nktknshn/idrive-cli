import * as A from 'fp-ts/lib/Array'
import { flow, identity, pipe } from 'fp-ts/lib/function'
import * as NA from 'fp-ts/lib/NonEmptyArray'
import * as O from 'fp-ts/lib/Option'
import { normalizePath } from '../../../cli/cli-drive/cli-drive-actions/helpers'
import * as H from '../../../lib/path-validation'
import * as T from '../types'

export type PathValid<H> = {
  valid: true
  path: H.Valid<H>
  file: O.Option<T.DriveChildrenItemFile>
}

export type PathValidWithFile<H> = {
  valid: true
  path: H.Valid<H>
  file: O.Some<T.DriveChildrenItemFile>
}

export type PathInvalid<H> = { valid: false; path: H.Partial<H>; error: Error }

export type PathValidation<H> =
  | PathValid<H>
  | PathInvalid<H>

export type GetByPathResult<R extends T.Root> = PathValidation<H.Hierarchy<R>>

export const target = <R extends T.Root>(
  res: PathValid<H.Hierarchy<R>>,
): R | T.DetailsFolder | T.DetailsAppLibrary | T.DriveChildrenItemFile => {
  return pipe(
    res.file,
    O.foldW(() => NA.last(res.path.details), identity),
  )
}

export const isValidWithFile = <H>(res: PathValidation<H>): res is PathValidWithFile<H> => {
  return res.valid === true && O.isSome(res.file)
}

export const isValid = <H>(res: PathValidation<H>): res is PathValid<H> => {
  return res.valid === true
}
export const isInvalid = <H>(res: PathValidation<H>): res is PathValid<H> => {
  return res.valid === false
}

export const validPath = <R extends T.Root>(
  path: H.Hierarchy<R>,
  file: O.Option<T.DriveChildrenItemFile> = O.none,
): PathValidation<H.Hierarchy<R>> => ({
  valid: true,
  path: H.validPath(path),
  file,
})

export const invalidPath = <R extends T.Root>(
  path: H.Partial<H.Hierarchy<R>>,
  error: Error,
): PathInvalid<H.Hierarchy<R>> => ({
  valid: false,
  path,
  error,
})

export const showGetByPathResult = <R extends T.Root>(p: PathValidation<H.Hierarchy<R>>) => {
  if (p.valid) {
    return `valid: ${p.path.details.map(T.fileName)} file: ${pipe(p.file, O.fold(() => `none`, T.fileName))}`
  }
  return `invalid (${p.error.message}). valid part ${p.path.details.map(T.fileName)}, rest: ${p.path.rest}`
}

export const asString = <R extends T.Root>(result: PathValid<H.Hierarchy<R>>) => {
  return normalizePath(
    [
      ...result.path.details.map(T.fileName),
      ...pipe(result.file, O.fold(() => [], flow(T.fileName, A.of))),
    ].join('/'),
  )
}
