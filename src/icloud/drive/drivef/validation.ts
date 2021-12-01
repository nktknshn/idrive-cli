import * as A from 'fp-ts/lib/Array'
import * as E from 'fp-ts/lib/Either'
import { Eq } from 'fp-ts/lib/Eq'
import { pipe } from 'fp-ts/lib/function'
import * as NA from 'fp-ts/lib/NonEmptyArray'
import * as O from 'fp-ts/lib/Option'
import * as T from 'fp-ts/lib/These'
import { normalizePath } from '../../../cli/actions/helpers'
import { NEA } from '../../../lib/types'
import { fileName, hasName } from '../helpers'
import { Details, DetailsRoot, isRootDetails } from '../types'

export type Hierarchy = [DetailsRoot, ...Details[]]
export const isHierarchy = (details: NEA<Details>): details is Hierarchy => isRootDetails(details[0])

const same = (a: Details, b: Details) => {
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

  return true
}
export type MaybeValidPath = T.These<Hierarchy, NEA<string>>

export const getValidHierarchyPart = (
  actualDetails: [DetailsRoot, ...O.Option<Details>[]],
  cachedHierarchy: Hierarchy,
): WithDetails => {
  const [root, ...actualRest] = actualDetails
  const [, ...cachedRest] = cachedHierarchy

  const actualRestDetails = pipe(
    actualRest,
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
          () => validPath([root, ...validPart]),
          rest => partialPath([root, ...validPart], rest),
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

export const partialPath = <H>(validPart: H, rest: NEA<string>): Partial<H> => T.both(validPart, rest) as Partial<H>

export const validPath = <H>(validPart: H): Valid<H> => T.left(validPart) as Valid<H>

export const concat = (h: Hierarchy, details: NEA<Details>): Hierarchy => NA.concat(h, details) as Hierarchy

export const eq: Eq<Hierarchy> = {
  equals: (a, b) => {
    if (a.length !== b.length) {
      return false
    }

    return pipe(
      A.zip(a, b),
      A.every(([a, b]) => same(a, b)),
    )
  },
}

// export const concatPaths = (a: Hierarchy, b: Partial): Hierarchy => {
//   return partial
// }

const showDetails = (ds: Details[]) => {
  return `${ds.map(fileName).join(' → ')}`
}

export const showMaybeValidPath = (p: MaybeValidPath): string => {
  return pipe(
    p,
    T.match(
      (details) => `valid: [${showDetails(details)}]`,
      (rest) => `invalid: rest ${rest}`,
      (details, rest) => `partial. valid: [${showDetails(details)}], rest: [${rest}]`,
    ),
  )
}
