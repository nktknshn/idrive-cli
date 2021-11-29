import * as A from 'fp-ts/lib/Array'
import * as E from 'fp-ts/lib/Either'
import { pipe } from 'fp-ts/lib/function'
import * as NA from 'fp-ts/lib/NonEmptyArray'
import * as T from 'fp-ts/lib/These'
import { DriveDetails } from '../types'
import * as P from './TwoPiles'
import { FullyCached, PartialyCached } from './validatePath'

type Pile = P.TwoPiles<DriveDetails, string>
type PileT = T.These<NA.NonEmptyArray<DriveDetails>, NA.NonEmptyArray<string>>
type PileResult = E.Either<FullyCached | PartialyCached, PileT>
const movePile = (f: (r: string) => DriveDetails) =>
  (pile: PileT): PileT =>
    pipe(
      pile,
      T.match(
        drives => pile,
        NA.matchLeft(
          (head, tail) =>
            pipe(
              tail,
              A.match(() => T.left(NA.of(f(head))), (tail) => T.both(NA.of(f(head)), tail)),
            ),
        ),
        (details, rest) =>
          pipe(
            rest,
            NA.matchLeft(
              (head, tail) =>
                pipe(
                  tail,
                  A.match(
                    () => T.left(NA.concat(details, NA.of(f(head)))),
                    (tail) => T.both(NA.concat(details, NA.of(f(head))), tail),
                  ),
                ),
            ),
          ),
      ),
    )
