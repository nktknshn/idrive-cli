import * as A from 'fp-ts/lib/Array'
import { flow, identity, pipe } from 'fp-ts/lib/function'
import * as NA from 'fp-ts/lib/NonEmptyArray'
import * as O from 'fp-ts/lib/Option'
import { normalizePath } from '../../../cli/cli-drive/cli-drive-actions/helpers'
import * as H from '../fdrive/validation'
import { DetailsAppLibrary, DetailsFolder, DriveChildrenItemFile, fileName, Root } from '../requests/types/types'

export type ResultValid<H> = {
  valid: true
  path: H.Valid<H>
  file: O.Option<DriveChildrenItemFile>
}

export type ResultValidWithFile<H> = {
  valid: true
  path: H.Valid<H>
  file: O.Some<DriveChildrenItemFile>
}

export type ResultInvalid<H> = { valid: false; path: H.Partial<H>; error: Error }

export type Result<H> =
  | ResultValid<H>
  | ResultInvalid<H>

export type HierarchyResult<R extends Root> = Result<H.Hierarchy<R>>

export const target = <R extends Root>(
  res: ResultValid<H.Hierarchy<R>>,
): R | DetailsFolder | DetailsAppLibrary | DriveChildrenItemFile => {
  return pipe(
    res.file,
    O.foldW(() => NA.last(res.path.details), identity),
  )
}

export const isValidWithFile = <H>(res: Result<H>): res is ResultValidWithFile<H> => {
  return res.valid === true && O.isSome(res.file)
}

export const validResult = <R extends Root>(
  path: H.Hierarchy<R>,
  file: O.Option<DriveChildrenItemFile> = O.none,
): Result<H.Hierarchy<R>> => ({
  valid: true,
  path: H.validPath(path),
  file,
})

export const invalidResult = <R extends Root>(
  path: H.Partial<H.Hierarchy<R>>,
  error: Error,
): ResultInvalid<H.Hierarchy<R>> => ({
  valid: false,
  path,
  error,
})

export const showGetByPathResult = <R extends Root>(p: Result<H.Hierarchy<R>>) => {
  if (p.valid) {
    return `valid: ${p.path.details.map(fileName)} file: ${pipe(p.file, O.fold(() => `none`, fileName))}`
  }
  return `invalid (${p.error.message}). valid part ${p.path.details.map(fileName)}, rest: ${p.path.rest}`
}

export const asString = <R extends Root>(result: ResultValid<H.Hierarchy<R>>) => {
  return normalizePath(
    [
      ...result.path.details.map(fileName),
      ...pipe(result.file, O.fold(() => [], flow(fileName, A.of))),
    ].join('/'),
  )
}
