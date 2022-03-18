import * as A from 'fp-ts/lib/Array'
import { flow, identity, pipe } from 'fp-ts/lib/function'
import * as NA from 'fp-ts/lib/NonEmptyArray'
import * as O from 'fp-ts/lib/Option'
import { normalizePath } from '../../../cli/cli-drive/cli-drive-actions/helpers'
import {
  DetailsAppLibrary,
  DetailsFolder,
  DriveChildrenItemFile,
  fileName,
  Root,
} from '../../drive/drive-requests/types/types'
import * as H from '../path-validation'

export type PathValid<H> = {
  valid: true
  path: H.Valid<H>
  file: O.Option<DriveChildrenItemFile>
}

export type PathValidWithFile<H> = {
  valid: true
  path: H.Valid<H>
  file: O.Some<DriveChildrenItemFile>
}

export type PathInvalid<H> = { valid: false; path: H.Partial<H>; error: Error }

export type PathValidation<H> =
  | PathValid<H>
  | PathInvalid<H>

export type GetByPathResult<R extends Root> = PathValidation<H.Hierarchy<R>>

export const target = <R extends Root>(
  res: PathValid<H.Hierarchy<R>>,
): R | DetailsFolder | DetailsAppLibrary | DriveChildrenItemFile => {
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

export const validPath = <R extends Root>(
  path: H.Hierarchy<R>,
  file: O.Option<DriveChildrenItemFile> = O.none,
): PathValidation<H.Hierarchy<R>> => ({
  valid: true,
  path: H.validPath(path),
  file,
})

export const invalidPath = <R extends Root>(
  path: H.Partial<H.Hierarchy<R>>,
  error: Error,
): PathInvalid<H.Hierarchy<R>> => ({
  valid: false,
  path,
  error,
})

export const showGetByPathResult = <R extends Root>(p: PathValidation<H.Hierarchy<R>>) => {
  if (p.valid) {
    return `valid: ${p.path.details.map(fileName)} file: ${pipe(p.file, O.fold(() => `none`, fileName))}`
  }
  return `invalid (${p.error.message}). valid part ${p.path.details.map(fileName)}, rest: ${p.path.rest}`
}

export const asString = <R extends Root>(result: PathValid<H.Hierarchy<R>>) => {
  return normalizePath(
    [
      ...result.path.details.map(fileName),
      ...pipe(result.file, O.fold(() => [], flow(fileName, A.of))),
    ].join('/'),
  )
}
