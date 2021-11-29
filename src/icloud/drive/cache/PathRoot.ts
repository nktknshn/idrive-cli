import * as B from 'fp-ts/boolean'
import * as A from 'fp-ts/lib/Array'
import * as E from 'fp-ts/lib/Either'
import { flow, pipe } from 'fp-ts/lib/function'
import * as NA from 'fp-ts/lib/NonEmptyArray'
import * as O from 'fp-ts/lib/Option'
import { NormalizedPath } from '../../../cli/actions/helpers'
import { NotFoundError } from '../errors'
import { fileName, parsePath } from '../helpers'
import { DriveChildrenItem, DriveDetails, DriveDetailsRoot } from '../types'
import { getRoot } from './cachef'
import { CacheF } from './types'

// points root
type PathRoot = {
  readonly tag: 'root'
  root: DriveDetailsRoot
}

// points anything relative to root
type FullyCached = {
  readonly tag: 'full'
  root: DriveDetailsRoot
  path: DriveDetails[]
  target: DriveDetails | DriveChildrenItem
}

type PartialyCached = {
  readonly tag: 'partial'
  root: DriveDetailsRoot
  error: Error
  path: DriveDetails[]
  rest: NA.NonEmptyArray<string>
}

type ZeroCached = {
  readonly tag: 'zero'
}

type Result = PathRoot | FullyCached | PartialyCached | ZeroCached

// const chipToLeft = <A, B>(pile: { left: NA.NonEmptyArray<A>; right: NA.NonEmptyArray<B> }): TwoPiles<A, B> => {
// }

type TwoPiles<A, B> =
  | { left: []; right: NA.NonEmptyArray<B> }
  | { left: NA.NonEmptyArray<A>; right: NA.NonEmptyArray<B> }
  | { left: NA.NonEmptyArray<A>; right: B[] }

const pileOf = <B, A = never>(
  right: NA.NonEmptyArray<B>,
): TwoPiles<A, B> => ({
  left: [],
  right,
})

const pileIsDone = <A, B>(
  pile: TwoPiles<A, B>,
): pile is { left: NA.NonEmptyArray<A>; right: [] } => pile.right.length == 0

const matchPiles = <A, B, C1, C2, C3>(
  onThird: (right: NA.NonEmptyArray<B>) => C3,
  onSecond: (left: NA.NonEmptyArray<A>, right: NA.NonEmptyArray<B>) => C2,
  onFirst: (left: NA.NonEmptyArray<A>) => C1,
) =>
  (pile: TwoPiles<A, B>): C1 | C2 | C3 => {
    if (A.isNonEmpty(pile.left) && A.isNonEmpty(pile.right)) {
      return onSecond(pile.left, pile.right)
    }
    else if (A.isNonEmpty(pile.left)) {
      return onFirst(pile.left)
    }

    return onThird(pile.right as NA.NonEmptyArray<B>)
  }

const chipPile = <A, B>(f: (r: B) => A) =>
  (
    pile: TwoPiles<A, B>,
  ): TwoPiles<A, B> =>
    pipe(
      pile,
      matchPiles(
        (right): TwoPiles<A, B> => ({ left: NA.of(f(NA.head(right))), right: NA.tail(right) }),
        (left, right): TwoPiles<A, B> => ({
          left: NA.concat(
            left,
            NA.of(f(NA.head(right))),
          ),
          right: NA.tail(right),
        }),
        (left): TwoPiles<A, B> => pile,
      ),
    )

const findInParent = (parent: DriveDetails, itemName: string) => {
  return pipe(
    parent.items,
    A.findFirst(item => fileName(item) == itemName),
  )
}

function validatePath(
  cache: CacheF,
  path: NormalizedPath,
): Result {
  const [_, ...parts] = parsePath(path)

  const caseRoot = (): PathRoot | ZeroCached => {
    return pipe(
      cache,
      getRoot(),
      E.foldW(
        (): ZeroCached => ({ tag: 'zero' }),
        (root): PathRoot => ({ tag: 'root', root: root.content }),
      ),
    )
  }

  const hasRest = (
    root: DriveDetailsRoot,
    rest: NA.NonEmptyArray<string>,
  ): FullyCached | PartialyCached => {
    pipe(
      pileOf(rest),
      matchPiles(),
    )
  }

  const iterate = (
    root: DriveDetailsRoot,
    pile: TwoPiles<DriveDetails, string>,
  ): TwoPiles<DriveDetails, string> => {
    pipe(
      pile,
      chipPile(),
    )
  }

  pipe(
    parts,
    A.matchW(
      caseRoot,
      rest =>
        pipe(
          caseRoot(),
          _ => _.tag === 'zero' ? _ : hasRest(_.root, rest),
        ),
    ),
  )
}
