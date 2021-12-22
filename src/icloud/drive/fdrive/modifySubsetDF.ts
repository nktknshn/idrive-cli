import * as A from 'fp-ts/lib/Array'
import { pipe } from 'fp-ts/lib/function'
import * as NA from 'fp-ts/lib/NonEmptyArray'
import * as O from 'fp-ts/lib/Option'
import { Refinement } from 'fp-ts/lib/Refinement'
import * as SRTE from 'fp-ts/lib/StateReaderTaskEither'
import * as DF from '../fdrive'

/** keeping the order modify subset of input which is true when `refinement` applied */
export const modifySubsetDF = <A, B extends A, C, D extends A>(
  input: NA.NonEmptyArray<A>,
  refinement: Refinement<A, B>,
  f: ((v: NA.NonEmptyArray<B>) => DF.DriveM<C[]>),
  fac: (a: D) => C,
): DF.DriveM<NA.NonEmptyArray<C>> => {
  const subset = pipe(
    input,
    A.filterMapWithIndex(
      (index, a) => refinement(a) ? O.some({ a, index }) : O.none,
    ),
  )

  return pipe(
    pipe(subset.map(_ => _.a), A.match(() => DF.of([]), f)),
    SRTE.map(A.zip(subset)),
    SRTE.map(A.map(([a, { index }]) => ({ a, index }))),
    SRTE.map(res => projectIndexes2(input as NA.NonEmptyArray<D>, res, fac)),
  )
}

export const projectIndexes2 = <A, B>(
  as: NA.NonEmptyArray<A>,
  values: { index: number; a: B }[],
  f: (a: A) => B,
): NA.NonEmptyArray<B> => {
  return pipe(
    as,
    NA.mapWithIndex((index, value) =>
      pipe(
        O.fromNullable(values.find(_ => _.index === index)),
        O.map(_ => _.a),
        O.fold(() => f(value), v => v),
      )
    ),
  )
}