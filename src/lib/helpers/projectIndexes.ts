import * as A from 'fp-ts/lib/Array'
import { pipe } from 'fp-ts/lib/function'
import * as O from 'fp-ts/lib/Option'
import { Refinement } from 'fp-ts/lib/Refinement'
import * as SRTE from 'fp-ts/lib/StateReaderTaskEither'
import * as DF from '../../icloud/drive/fdrive'

export const projectIndexes = <T>(as: T[], values: { index: number; a: T }[]) => {
  return pipe(
    as,
    A.mapWithIndex((index, value) =>
      pipe(
        O.fromNullable(values.find(_ => _.index === index)),
        O.map(_ => _.a),
        O.fold(() => value, v => v),
      )
    ),
  )
}

export const modifySubset = <A, B extends A>(
  as: A[],
  refinement: Refinement<A, B>,
  f: ((v: B[]) => A[]),
): A[] => {
  const subset = pipe(
    as,
    A.filterMapWithIndex(
      (index, a) => refinement(a) ? O.some({ a, index }) : O.none,
    ),
  )

  return pipe(
    f(subset.map(_ => _.a)),
    A.zip(subset),
    A.map(([a, { index }]) => ({ a, index })),
    res => projectIndexes(as, res),
  )
}

export const modifySubsetDF = <A, B extends A>(
  as: A[],
  refinement: Refinement<A, B>,
  f: ((v: B[]) => DF.DriveM<A[]>),
): DF.DriveM<A[]> => {
  const subset = pipe(
    as,
    A.filterMapWithIndex(
      (index, a) => refinement(a) ? O.some({ a, index }) : O.none,
    ),
  )

  return pipe(
    f(subset.map(_ => _.a)),
    SRTE.map(A.zip(subset)),
    SRTE.map(A.map(([a, { index }]) => ({ a, index }))),
    SRTE.map(res => projectIndexes(as, res)),
  )
}
