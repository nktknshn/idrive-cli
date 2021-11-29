import * as B from 'fp-ts/boolean'
import * as A from 'fp-ts/lib/Array'
import * as E from 'fp-ts/lib/Either'
import { flow, identity, pipe } from 'fp-ts/lib/function'
import * as NA from 'fp-ts/lib/NonEmptyArray'
import * as O from 'fp-ts/lib/Option'
import { NormalizedPath } from '../../../cli/actions/helpers'
import { ItemIsNotFolder, NotFoundError } from '../errors'
import { fileName, parsePath } from '../helpers'
import {
  DriveChildrenItem,
  DriveChildrenItemFile,
  DriveDetails,
  DriveDetailsRoot,
  isFolderDetails,
  isFolderLike,
} from '../types'
import * as C from './cachef'
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

const matchPilesW = <A, B, C1, C2, C3>(
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
      matchPilesW(
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

const chipOption = <A, B>(f: (l: O.Option<A>, r: B) => A) =>
  (
    pile: TwoPiles<A, B>,
  ): TwoPiles<A, B> =>
    pipe(
      pile,
      matchPilesW(
        (right): TwoPiles<A, B> => ({
          left: NA.of(f(O.none, NA.head(right))),
          right: NA.tail(right),
        }),
        (left, right): TwoPiles<A, B> => ({
          left: NA.concat(
            left,
            NA.of(f(O.some(NA.last(left)), NA.head(right))),
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
      C.getRoot(),
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
      iterate(root, pileOf(rest)),
    )
  }

  type Pile = TwoPiles<DriveDetails, string>

  const iterate = (
    root: DriveDetailsRoot,
    pile: Pile,
  ): E.Either<Result, Pile> => {
    const lookupItem = (parent: DriveDetails, subItem: string) => {
      return pipe(
        findInParent(parent, subItem),
        E.fromOption(() => NotFoundError.createTemplate(subItem, root.drivewsid)),
        E.chain(item =>
          isFolderLike(item)
            ? pipe(
              cache,
              C.getByIdE(item.drivewsid),
              E.map(_ => _.content),
              E.chain(C.assertFolderWithDetails),
            )
            : E.of<Error, DriveDetails | DriveChildrenItemFile>(item)
        ),
      )
    }

    const res: E.Either<Result, Pile> = pipe(
      pile,
      matchPilesW(
        (rest): E.Either<PartialyCached | FullyCached, Pile> => {
          // lookup in root
          const subItem = NA.head(rest)
          const rest_ = NA.tail(rest)

          return pipe(
            lookupItem(root, subItem),
            E.mapLeft(
              (error): PartialyCached => ({ tag: 'partial', root, error, path: [], rest }),
            ),
            E.chain(item =>
              pipe(
                rest_,
                A.matchW(
                  (): E.Either<PartialyCached | FullyCached, Pile> =>
                    E.left({ tag: 'full', root, path: [], target: item } as FullyCached),
                  (rest): E.Either<PartialyCached, Pile> =>
                    pipe(
                      C.assertFolderWithDetails(item),
                      E.mapLeft((error): PartialyCached => ({ tag: 'partial', root, error, path: [], rest })),
                      E.map(item => pipe(pile, chipPile(() => item))),
                    ),
                ),
              )
            ),
          )
        },
        (path, rest): E.Either<PartialyCached | FullyCached, Pile> => {
          // lookup in last details
          const subItem = NA.head(rest)
          const rest_ = NA.tail(rest)

          return pipe(
            lookupItem(NA.last(path), subItem),
            E.mapLeft(
              (error): PartialyCached => ({ tag: 'partial', root, error, path, rest }),
            ),
            E.chain(item =>
              pipe(
                rest_,
                A.matchW(
                  (): E.Either<PartialyCached | FullyCached, Pile> =>
                    E.left({ tag: 'full', root, path, target: item } as FullyCached),
                  (rest): E.Either<PartialyCached, Pile> =>
                    pipe(
                      C.assertFolderWithDetails(item),
                      E.mapLeft((error): PartialyCached => ({ tag: 'partial', root, error, path, rest })),
                      E.map(item => pipe(pile, chipPile(() => item))),
                    ),
                ),
              )
            ),
          )
        },
        (details) => {
          const path: FullyCached = {
            tag: 'full',
            root,
            path: NA.init(details),
            target: NA.last(details),
          }
          return E.left(path)
        },
      ),
    )

    return res
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
