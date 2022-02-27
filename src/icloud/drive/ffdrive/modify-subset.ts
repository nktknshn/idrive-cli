import * as A from 'fp-ts/lib/Array'
import * as E from 'fp-ts/lib/Either'
import { pipe } from 'fp-ts/lib/function'
import * as NA from 'fp-ts/lib/NonEmptyArray'
import * as O from 'fp-ts/lib/Option'
import { Refinement } from 'fp-ts/lib/Refinement'
import * as SRTE from 'fp-ts/lib/StateReaderTaskEither'
import * as DF from '../ffdrive'

/** modify subset of input which is true when `refinement` applied */
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
    SRTE.map(res => projectIndexes(input as NA.NonEmptyArray<D>, res, fac)),
  )
}

export const projectIndexes = <A, B>(
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

// const separateWithIndex = () => {
// }

// export const modifySubsetDF2 = <A, B extends A, C, D extends A>(
//   input: NA.NonEmptyArray<A>,
//   refinement: Refinement<A, B>,
//   f: ((v: B[]) => DF.DriveM<C[]>),
//   fac: (a: A[]) => C[],
// ): DF.DriveM<NA.NonEmptyArray<C>> => {
//   const subsets = pipe(
//     input,
//     A.mapWithIndex(
//       (index, a) =>
//         refinement(a)
//           ? E.right({ a, index })
//           : E.left({ a, index }),
//     ),
//   )

//   const trueSubset = pipe(
//     subsets,
//     A.filter(E.isRight),
//     A.map(_ => _.right),
//   )

//   const falseSubset = pipe(
//     subsets,
//     A.filter(E.isLeft),
//     A.map(_ => _.left),
//   )

//   fac(falseSubset.map(_ => _.a))

//   pipe(
//     f(trueSubset.map(_ => _.a)),
//   )

//   // const projectIndexes = <A, B>(
//   //   as: NA.NonEmptyArray<A>,
//   //   values: { index: number; a: B }[],
//   //   f: (a: A[]) => B[],
//   // ): NA.NonEmptyArray<B> => {
//   //   return pipe(
//   //     as,
//   //     NA.mapWithIndex((index, value) =>
//   //       pipe(
//   //         O.fromNullable(values.find(_ => _.index === index)),
//   //         O.map(_ => _.a),
//   //         O.fold(() => f(value), v => v),
//   //       )
//   //     ),
//   //   )
//   // }

//   // return pipe(
//   //   pipe(subset.map(_ => _.a), A.match(() => DF.of([]), f)),
//   //   SRTE.map(A.zip(subset)),
//   //   SRTE.map(A.map(([a, { index }]) => ({ a, index }))),
//   //   SRTE.map(res => projectIndexes(input as NA.NonEmptyArray<D>, res, fac)),
//   // )
// }
