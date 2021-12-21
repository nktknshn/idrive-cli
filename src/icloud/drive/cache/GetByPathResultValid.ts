import * as A from 'fp-ts/lib/Array'
import { flow, identity, pipe } from 'fp-ts/lib/function'
import * as NA from 'fp-ts/lib/NonEmptyArray'
import * as O from 'fp-ts/lib/Option'
import { normalizePath } from '../../../cli/cli-drive/cli-drive-actions/helpers'
import * as H from '../drivef/validation'
import {
  Details,
  DetailsAppLibrary,
  DetailsFolder,
  DetailsTrash,
  DriveChildrenItemFile,
  fileName,
  Hierarchy,
  Root,
} from '../types'

export type GetByPathResultValid<H> = {
  valid: true
  path: H.Valid<H>
  file: O.Option<DriveChildrenItemFile>
}

export type GetByPathResultValidWithFile<H> = {
  valid: true
  path: H.Valid<H>
  file: O.Some<DriveChildrenItemFile>
}

export type GetByPathResultInvalid<H> = { valid: false; path: H.Partial<H>; error: Error }

export type GetByPathResult<H> =
  | GetByPathResultValid<H>
  | GetByPathResultInvalid<H>

export type HierarchyResult<R extends Root> = GetByPathResult<H.Hierarchy<R>>

export const target = <R extends Root>(
  res: GetByPathResultValid<H.Hierarchy<R>>,
): R | DetailsFolder | DetailsAppLibrary | DriveChildrenItemFile => {
  return pipe(
    res.file,
    O.foldW(() => NA.last(res.path.details), identity),
  )
}

export const isValidWithFile = <H>(res: GetByPathResult<H>): res is GetByPathResultValidWithFile<H> => {
  return res.valid === true && O.isSome(res.file)
}

export const validResult = <R extends Root>(
  path: H.Hierarchy<R>,
  file: O.Option<DriveChildrenItemFile> = O.none,
): GetByPathResult<H.Hierarchy<R>> => ({
  valid: true,
  path: H.validPath(path),
  file,
})

export const invalidResult = <R extends Root>(
  path: H.Partial<H.Hierarchy<R>>,
  error: Error,
): GetByPathResultInvalid<H.Hierarchy<R>> => ({
  valid: false,
  path,
  error,
})

export const showGetByPathResult = <R extends Root>(p: GetByPathResult<H.Hierarchy<R>>) => {
  if (p.valid) {
    return `valid: ${p.path.details.map(fileName)} file: ${pipe(p.file, O.fold(() => `none`, fileName))}`
  }
  return `invalid (${p.error.message}). valid part ${p.path.details.map(fileName)}, rest: ${p.path.rest}`
}

export const asString = <R extends Root>(result: GetByPathResultValid<H.Hierarchy<R>>) => {
  return normalizePath(
    [
      ...result.path.details.map(fileName),
      ...pipe(result.file, O.fold(() => [], flow(fileName, A.of))),
    ].join('/'),
  )
}
