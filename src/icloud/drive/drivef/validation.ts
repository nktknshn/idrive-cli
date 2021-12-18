import * as A from 'fp-ts/lib/Array'
import * as E from 'fp-ts/lib/Either'
import { Eq } from 'fp-ts/lib/Eq'
import { pipe } from 'fp-ts/lib/function'
import * as NA from 'fp-ts/lib/NonEmptyArray'
import * as O from 'fp-ts/lib/Option'
import * as T from 'fp-ts/lib/These'
import { normalizePath } from '../../../cli/cli-drive/cli-drive-actions/helpers'
import { NEA } from '../../../lib/types'
import {
  Details,
  DetailsRoot,
  DetailsTrash,
  fileName,
  hasName,
  isRegularDetails,
  isRootDetails,
  isTrashDetails,
  RegularDetails,
  Root,
} from '../types'

// export type Hierarchy = [DetailsRoot, ...Details[]]
export type Hierarchy = [DetailsRoot, ...Details[]]
// export type TrashHierarchy = [DetailsTrash, ...Details[]]

export const isHierarchy = (details: NEA<Details>): details is Hierarchy =>
  isRootDetails(details[0]) || isTrashDetails(details[0])

const same = (a: Details, b: Details) => {
  if (a.drivewsid !== b.drivewsid) {
    return false
  }

  if (isRegularDetails(a) && isRegularDetails(b)) {
    if (a.parentId !== b.parentId) {
      return false
    }
  }

  if (hasName(a) && hasName(b)) {
    return fileName(a) == fileName(b)
  }

  return true
}

// export type MaybeValidPath = T.These<Hierarchy, NEA<string>>

export const getValidHierarchyPart = (
  actualDetails: [DetailsRoot, ...O.Option<Details>[]],
  cachedHierarchy: Hierarchy,
): WithDetails => {
  const [actualRoot, ...actualPath] = actualDetails
  const [cachedroot, ...cachedPath] = cachedHierarchy

  const actualPathDetails = pipe(
    actualPath,
    A.takeLeftWhile(O.isSome),
    A.map(_ => _.value),
  )

  return pipe(
    A.zip(actualPathDetails, cachedPath),
    A.takeLeftWhile(([a, b]) => same(a, b)),
    _ => ({
      validPart: A.takeLeft(_.length)(actualPathDetails),
      rest: pipe(
        A.dropLeft(_.length)(cachedPath),
        A.map(fileName),
      ),
    }),
    ({ validPart, rest }) =>
      pipe(
        rest,
        A.matchW(
          () => validPath([actualRoot, ...validPart]),
          rest => partialPath([actualRoot, ...validPart], rest),
        ),
      ),
  )
}

export type MaybeValidPath<H = Hierarchy> = Valid<H> | Partial<H> | Invalid

export type WithRest<H = Hierarchy> = Partial<H> | Invalid
export type WithDetails<H = Hierarchy> = Partial<H> | Valid<H>

export type Valid<H = Hierarchy> = { tag: 'Valid'; details: H }
export type Partial<H = Hierarchy> = { tag: 'Partial'; details: H; rest: NEA<string> }
export type Invalid = { tag: 'Invalid'; rest: NEA<string> }

// export type Partial<H = Hierarchy> = T.Both<H, NEA<string>>
// export type WithRest<H = Hierarchy> = T.Both<H, NEA<string>> | E.Right<NEA<string>>
// export type WithDetails<H = Hierarchy> = T.Both<H, NEA<string>> | E.Left<Hierarchy>
// export type Valid<H = Hierarchy> = E.Left<H>
// export const isWithDetails = (vh: MaybeValidPath): vh is WithDetails => T.isBoth(vh) || T.isLeft(vh)
// export const isPartial = (vh: MaybeValidPath): vh is Partial => T.isBoth(vh)
// export const partialPath = <H>(validPart: H, rest: NEA<string>): Partial<H> => T.both(validPart, rest) as Partial<H>
// export const validPath = <H>(validPart: H): Valid<H> => T.left(validPart) as Valid<H>

// export const isValid = T.isLeft
// export const isPartialyValid = T.isBoth
// export const isFullyInvalid = T.isRight

export const isValid = <H>(p: MaybeValidPath<H>): p is Valid<H> => p.tag === 'Valid'
export const isPartialyValid = <H>(p: MaybeValidPath<H>): p is Partial<H> => p.tag === 'Partial'
export const isFullyInvalid = <H>(p: MaybeValidPath<H>): p is Valid<H> => p.tag === 'Invalid'

export const isWithRest = (vh: MaybeValidPath): vh is WithRest => vh.tag === 'Invalid' || vh.tag === 'Partial'

export const isWithDetails = (vh: MaybeValidPath): vh is WithDetails => vh.tag === 'Valid' || vh.tag === 'Partial'

export const partialPath = <H>(validPart: H, rest: NEA<string>): Partial<H> => ({
  tag: 'Partial',
  details: validPart,
  rest: rest,
})

export const validPath = <H>(validPart: H): Valid<H> => ({
  tag: 'Valid',
  details: validPart,
})

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

const showDetails = (ds: (Details | DetailsTrash)[]) => {
  return `${ds.map(d => isRegularDetails(d) ? fileName(d) : isTrashDetails(d) ? 'Trash' : '/').join(' → ')}`
}

export const match = <H, R>(
  onValid: (h: H) => R,
  onInvalid: (rest: NEA<string>) => R,
  onPartial: (h: H, rest: NEA<string>) => R,
) =>
  (p: MaybeValidPath<H>): R => {
    if (isValid(p)) {
      return onValid(p.details)
    }
    else if (isPartialyValid(p)) {
      return onPartial(p.details, p.rest)
    }
    return onInvalid(p.rest)
  }

export const showMaybeValidPath = (p: MaybeValidPath): string => {
  return pipe(
    p,
    match(
      (details) => `valid: [${showDetails(details)}]`,
      (rest) => `invalid: rest ${rest}`,
      (details, rest) => `partial. valid: [${showDetails(details)}], rest: [${rest}]`,
    ),
  )
}
