import * as A from 'fp-ts/lib/Array'
import { flow, identity, pipe } from 'fp-ts/lib/function'
import * as NA from 'fp-ts/lib/NonEmptyArray'
import * as O from 'fp-ts/lib/Option'
import { normalizePath } from '../../../cli/actions/helpers'
import * as H from '../drivef/validation'
import { fileName } from '../helpers'
import { Details, DriveChildrenItemFile } from '../types'

export type GetByPathResultValid = { valid: true; path: H.Valid; file: O.Option<DriveChildrenItemFile> }

export type GetByPathResultInvalid = { valid: false; path: H.Partial; error: Error }

export type GetByPathResult =
  | GetByPathResultValid
  | GetByPathResultInvalid

export const target = (res: GetByPathResultValid): Details | DriveChildrenItemFile => {
  return pipe(
    res.file,
    O.foldW(() => NA.last(res.path.left), identity),
  )
}

export const validResult = (path: H.Hierarchy, file: O.Option<DriveChildrenItemFile> = O.none): GetByPathResult => ({
  valid: true,
  path: H.validPath(path),
  file,
})

export const invalidResult = (path: H.Partial, error: Error): GetByPathResultInvalid => ({
  valid: false,
  path,
  error,
})

export const showGetByPathResult = (p: GetByPathResult) => {
  if (p.valid) {
    return `valid: ${p.path.left.map(fileName)} file: ${pipe(p.file, O.fold(() => `none`, fileName))}`
  }
  return `invalid (${p.error.message}). valid part ${p.path.left.map(fileName)}, rest: ${p.path.right}`
}

export const asString = (result: GetByPathResultValid) => {
  return normalizePath(
    [
      ...result.path.left.map(fileName),
      ...pipe(result.file, O.fold(() => [], flow(fileName, A.of))),
    ].join('/'),
  )
}
