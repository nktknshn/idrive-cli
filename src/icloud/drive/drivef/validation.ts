import * as A from 'fp-ts/lib/Array'
import * as E from 'fp-ts/lib/Either'
import { pipe } from 'fp-ts/lib/function'
import * as NA from 'fp-ts/lib/NonEmptyArray'
import * as O from 'fp-ts/lib/Option'
import * as T from 'fp-ts/lib/These'
import { NEA } from '../../../lib/types'
import { fileName, hasName } from '../helpers'
import { DriveDetails, DriveDetailsRoot, isRootDetails } from '../types'

export type Hierarchy = [DriveDetailsRoot, ...DriveDetails[]]
export const isHierarchy = (details: NEA<DriveDetails>): details is Hierarchy => isRootDetails(details[0])

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
export type MaybeValidPath = T.These<Hierarchy, NEA<string>>
// | { validPart: NEA<DriveDetails>; rest: [] }
// | { validPart: NEA<DriveDetails>; rest: NEA<string> }
// | { validPart: DriveDetails[]; rest: NEA<string> }

export const getValidHierarchyPart = (
  actualDetails: [DriveDetailsRoot, ...O.Option<DriveDetails>[]],
  cachedHierarchy: Hierarchy,
): WithDetails => {
  const [root, ...rest] = actualDetails
  const [, ...cachedRest] = cachedHierarchy

  const actualRestDetails = pipe(
    rest,
    A.takeLeftWhile(O.isSome),
    A.map(_ => _.value),
  )

  return pipe(
    A.zip(actualRestDetails, cachedRest),
    A.takeLeftWhile(([a, b]) => same(a, b)),
    _ => ({
      validPart: A.takeLeft(_.length)(actualRestDetails),
      rest: pipe(
        A.dropLeft(_.length)(cachedRest),
        A.map(fileName),
      ),
    }),
    ({ validPart, rest }) =>
      pipe(
        rest,
        A.matchW(
          () => valid([root, ...validPart]),
          rest => partial([root, ...validPart], rest),
        ),
      ),
  )
}

export const isValid = T.isLeft
export const isPartialyValid = T.isBoth
export const isFullyInvalid = T.isRight

export const isWithRest = (vh: MaybeValidPath): vh is WithRest => T.isBoth(vh) || T.isRight(vh)
export const isWithDetails = (vh: MaybeValidPath): vh is WithDetails => T.isBoth(vh) || T.isLeft(vh)
export const isPartial = (vh: MaybeValidPath): vh is Partial => T.isBoth(vh)

export type Partial<H = Hierarchy> = T.Both<H, NEA<string>>
export type WithRest<H = Hierarchy> = T.Both<H, NEA<string>> | E.Right<NEA<string>>
export type WithDetails<H = Hierarchy> = T.Both<H, NEA<string>> | E.Left<Hierarchy>
export type Valid<H = Hierarchy> = E.Left<H>

export const partial = <H>(validPart: H, rest: NEA<string>): Partial<H> => T.both(validPart, rest) as Partial<H>

export const valid = <H>(validPart: H): Valid<H> => T.left(validPart) as Valid<H>

export const concat = (h: Hierarchy, details: DriveDetails): Hierarchy => NA.concat(h, NA.of(details)) as Hierarchy

const showDetails = (ds: DriveDetails[]) => {
  return `${ds.map(fileName).join(' → ')}`
}

export const showMaybeValidPath = (p: MaybeValidPath): string => {
  return pipe(
    p,
    T.match(
      (details) => `valid: ${showDetails(details)}`,
      (rest) => `invalid:  rest ${rest}`,
      (details, rest) => `partial. valid: [${showDetails(details)}], rest: [${rest}]`,
    ),
  )
}
