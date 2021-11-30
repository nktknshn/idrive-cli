import * as A from 'fp-ts/lib/Array'
import * as E from 'fp-ts/lib/Either'
import { pipe } from 'fp-ts/lib/function'
import * as NA from 'fp-ts/lib/NonEmptyArray'
import * as O from 'fp-ts/lib/Option'
import * as T from 'fp-ts/lib/These'
import { NEA } from '../../../lib/types'
import { fileName, hasName } from '../helpers'
import { DriveDetails, isRootDetails } from '../types'

const same = (a: DriveDetails, b: DriveDetails) => {
  if (a.drivewsid !== b.drivewsid) {
    return false
  }

  if (!isRootDetails(a) && !isRootDetails(b)) {
    if (a.parentId !== b.parentId) {
      return false
    }
  }

  if (hasName(a) && hasName(b)) {
    return fileName(a) == fileName(b)
  }

  // if (
  //   !isHierarchyItemTrash(a) && !isHierarchyItemRoot(a)
  //   && !isHierarchyItemTrash(b) && !isHierarchyItemRoot(b)
  // ) {
  //   return fileName(a) == fileName(b)
  // }

  return true
}
export type MaybeValidPath = T.These<NEA<DriveDetails>, NEA<string>>
// | { validPart: NEA<DriveDetails>; rest: [] }
// | { validPart: NEA<DriveDetails>; rest: NEA<string> }
// | { validPart: DriveDetails[]; rest: NEA<string> }

export const getValidHierarchyPart = (
  actualDetails: NA.NonEmptyArray<O.Option<DriveDetails>>,
  cachedHierarchy: NA.NonEmptyArray<DriveDetails>,
): MaybeValidPath => {
  const presentDetails = pipe(
    actualDetails,
    A.takeLeftWhile(O.isSome),
    A.map(_ => _.value),
  )

  return pipe(
    A.zip(presentDetails, cachedHierarchy),
    A.takeLeftWhile(([a, b]) => same(a, b)),
    _ => ({
      validPart: A.takeLeft(_.length)(presentDetails),
      rest: pipe(
        A.dropLeft(_.length)(cachedHierarchy),
        A.map(_ => hasName(_) ? fileName(_) : 'ERROR'),
      ),
    }),
    ({ validPart, rest }) => fromPartAndRest(validPart, rest),
  )
}

// TODO: make it overloaded
export const fromPartAndRest = (validPart: DriveDetails[], rest: string[]): MaybeValidPath => {
  if (A.isNonEmpty(validPart) && A.isNonEmpty(rest)) {
    return T.both(validPart, rest)
  }
  else if (A.isNonEmpty(validPart)) {
    return T.left(validPart)
  }
  else {
    return T.right(rest as NEA<string>)
  }
}

export const isValid = T.isLeft
export const isPartialyValid = T.isBoth
export const isFullyInvalid = T.isRight

export const isWithRest = (vh: MaybeValidPath): vh is WithRest => T.isBoth(vh) || T.isRight(vh)
export const isWithDetails = (vh: MaybeValidPath): vh is WithDetails => T.isBoth(vh) || T.isLeft(vh)
export const isPartial = (vh: MaybeValidPath): vh is Partial => T.isBoth(vh)

export type Partial = T.Both<NEA<DriveDetails>, NEA<string>>
export type WithRest = T.Both<NEA<DriveDetails>, NEA<string>> | E.Right<NEA<string>>
export type WithDetails = T.Both<NEA<DriveDetails>, NEA<string>> | E.Left<NEA<DriveDetails>>
export type Valid = E.Left<NEA<DriveDetails>>

export const partial = (validPart: NEA<DriveDetails>, rest: NEA<string>): Partial => T.both(validPart, rest) as Partial
