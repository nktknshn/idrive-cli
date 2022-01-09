import * as A from 'fp-ts/lib/Array'
import { Eq } from 'fp-ts/lib/Eq'
import { pipe } from 'fp-ts/lib/function'
import * as NA from 'fp-ts/lib/NonEmptyArray'
import * as O from 'fp-ts/lib/Option'
import { NEA } from '../../../lib/types'
import {
  Details,
  DetailsTrash,
  fileName,
  hasName,
  isCloudDocsRootDetails,
  isRegularDetails,
  isTrashDetails,
  NonRootDetails,
  Root,
} from '../requests/types/types'

export type Hierarchy<R> = [R, ...NonRootDetails[]]

export const tail = <R extends Root>([, ...tail]: Hierarchy<R>) => tail

export const isHierarchy = <R extends Root>(details: NEA<Details>): details is Hierarchy<R> =>
  isCloudDocsRootDetails(details[0]) || isTrashDetails(details[0])

const isSameDetails = (a: Details, b: Details) => {
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

export const getValidHierarchyPart = <R extends Root>(
  cachedHierarchy: Hierarchy<R>,
  actualDetails: [R, ...O.Option<NonRootDetails>[]],
): WithDetails<Hierarchy<R>> => {
  const [actualRoot, ...actualPath] = actualDetails
  const [cachedroot, ...cachedPath] = cachedHierarchy

  const actualPathDetails = pipe(
    actualPath,
    A.takeLeftWhile(O.isSome),
    A.map(_ => _.value),
  )

  return pipe(
    A.zip(actualPathDetails, cachedPath),
    A.takeLeftWhile(([a, b]) => isSameDetails(a, b)),
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

export type MaybeValidPath<H> = Valid<H> | Partial<H> | Invalid

export type WithRest<H> = Partial<H> | Invalid
export type WithDetails<H> = Partial<H> | Valid<H>

export type Valid<H> = { tag: 'Valid'; details: H }
export type Partial<H> = { tag: 'Partial'; details: H; rest: NEA<string> }
export type Invalid = { tag: 'Invalid'; rest: NEA<string> }

export const isValid = <H>(p: MaybeValidPath<H>): p is Valid<H> => p.tag === 'Valid'
export const isPartialyValid = <H>(p: MaybeValidPath<H>): p is Partial<H> => p.tag === 'Partial'
export const isFullyInvalid = <H>(p: MaybeValidPath<H>): p is Valid<H> => p.tag === 'Invalid'

export const isWithRest = <H>(vh: MaybeValidPath<H>): vh is WithRest<H> => vh.tag === 'Invalid' || vh.tag === 'Partial'

export const isWithDetails = <H>(vh: MaybeValidPath<H>): vh is WithDetails<H> =>
  vh.tag === 'Valid' || vh.tag === 'Partial'

export const partialPath = <H>(validPart: H, rest: NEA<string>): Partial<H> => ({
  tag: 'Partial',
  details: validPart,
  rest: rest,
})

export const validPath = <H>(validPart: H): Valid<H> => ({
  tag: 'Valid',
  details: validPart,
})

export const concat = <R>(h: Hierarchy<R>, details: NEA<Details>): Hierarchy<R> => [...h, ...details] as Hierarchy<R>

export const eq = <R extends Root>(): Eq<Hierarchy<R>> => ({
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

const showDetails = (ds: (Details | DetailsTrash)[]) => {
  return `${ds.map(d => isRegularDetails(d) ? fileName(d) : isTrashDetails(d) ? 'Trash' : '/').join(' → ')}`
}

export const match = <H, Result>(
  onValid: (h: H) => Result,
  onInvalid: (rest: NEA<string>) => Result,
  onPartial: (h: H, rest: NEA<string>) => Result,
) =>
  (p: MaybeValidPath<H>): Result => {
    if (isValid(p)) {
      return onValid(p.details)
    }
    else if (isPartialyValid(p)) {
      return onPartial(p.details, p.rest)
    }
    return onInvalid(p.rest)
  }

export const showMaybeValidPath = <R extends Root>(p: MaybeValidPath<Hierarchy<R>>): string => {
  return pipe(
    p,
    match(
      (details) => `valid: [${showDetails(details)}]`,
      (rest) => `invalid: rest ${rest}`,
      (details, rest) => `partial. valid: [${showDetails(details)}], rest: [${rest}]`,
    ),
  )
}
