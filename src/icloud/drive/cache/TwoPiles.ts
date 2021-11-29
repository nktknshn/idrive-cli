import * as A from 'fp-ts/lib/Array'
import { pipe } from 'fp-ts/lib/function'
import * as NA from 'fp-ts/lib/NonEmptyArray'
import * as O from 'fp-ts/lib/Option'

export type TwoPiles<A, B> =
  | { left: []; right: NA.NonEmptyArray<B> }
  | { left: NA.NonEmptyArray<A>; right: NA.NonEmptyArray<B> }
  | { left: NA.NonEmptyArray<A>; right: B[] }

// export const step = <A, B>(

// ) => (pile: TwoPiles<A, B>) => pipe(

// )

export const pileOf = <B, A = never>(
  right: NA.NonEmptyArray<B>,
): TwoPiles<A, B> => ({
  left: [],
  right,
})

const pileIsDone = <A, B>(
  pile: TwoPiles<A, B>,
): pile is { left: NA.NonEmptyArray<A>; right: [] } => pile.right.length == 0
export const matchPilesW = <A, B, C1, C2, C3>(
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
export const chipPile = <A, B>(f: (r: B) => A) =>
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
