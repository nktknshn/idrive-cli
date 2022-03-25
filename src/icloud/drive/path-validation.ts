// import * as A from 'fp-ts/lib/Array'
// import { Eq } from 'fp-ts/lib/Eq'
// import { pipe } from 'fp-ts/lib/function'
// import * as O from 'fp-ts/lib/Option'
// import { NEA } from '../../lib/types'
// import * as T from './types'

// /** Represents a chain of nested folders binded to root R */
// export type Hierarchy<R> = [R, ...T.NonRootDetails[]]

// export type PathValidation<H> = Valid<H> | Partial<H>

// export type WithRest<H> = Partial<H>
// // export type WithDetails<H> = Partial<H> | Valid<H>

// export type Valid<R> = { valid: true; details: Hierarchy<R> }
// export type Partial<R> = { valid: false; details: Hierarchy<R>; rest: NEA<string> }

// export const getValidHierarchyPart = <R extends T.Root>(
//   cachedHierarchy: Hierarchy<R>,
//   actualDetails: [R, ...O.Option<T.NonRootDetails>[]],
// ): PathValidation<R> => {
//   const [actualRoot, ...actualPath] = actualDetails
//   const [cachedroot, ...cachedPath] = cachedHierarchy

//   const actualPathDetails = pipe(
//     actualPath,
//     A.takeLeftWhile(O.isSome),
//     A.map(_ => _.value),
//   )

//   return pipe(
//     A.zip(actualPathDetails, cachedPath),
//     A.takeLeftWhile(([a, b]) => isSameDetails(a, b)),
//     _ => ({
//       validPart: A.takeLeft(_.length)(actualPathDetails),
//       rest: pipe(
//         cachedPath,
//         A.dropLeft(_.length),
//         A.map(T.fileName),
//       ),
//     }),
//     ({ validPart, rest }) =>
//       pipe(
//         rest,
//         A.matchW(
//           () => validPath([actualRoot, ...validPart]),
//           rest => partialPath([actualRoot, ...validPart], rest),
//         ),
//       ),
//   )
// }

// const isSameDetails = (a: T.Details, b: T.Details) => {
//   if (a.drivewsid !== b.drivewsid) {
//     return false
//   }

//   if (T.isRegularDetails(a) && T.isRegularDetails(b)) {
//     if (a.parentId !== b.parentId) {
//       return false
//     }
//   }

//   if (T.hasName(a) && T.hasName(b)) {
//     return T.fileName(a) == T.fileName(b)
//   }

//   return true
// }

// export const tail = <R>([, ...tail]: Hierarchy<R>) => tail
// export const root = <R>([root]: Hierarchy<R>) => root

// export const isHierarchy = <R extends T.Root>(details: NEA<T.Details>): details is Hierarchy<R> =>
//   T.isCloudDocsRootDetails(details[0]) || T.isTrashDetails(details[0])

// export const isValid = <H>(p: PathValidation<H>): p is Valid<H> => p.valid
// export const isPartialyValid = <H>(p: PathValidation<H>): p is Partial<H> => !p.valid

// export const isWithRest = <H>(vh: PathValidation<H>): vh is WithRest<H> => !vh.valid

// export const isWithDetails = <H>(vh: PathValidation<H>): vh is WithDetails<H> => true

// export const partialPath = <R>(validPart: Hierarchy<R>, rest: NEA<string>): Partial<R> => ({
//   valid: false,
//   details: validPart,
//   rest: rest,
// })

// export const validPath = <R>(validPart: Hierarchy<R>): Valid<R> => ({
//   valid: true,
//   details: validPart,
// })

// export const concat = <R>(h: Hierarchy<R>, details: NEA<T.Details>): Hierarchy<R> => [...h, ...details] as Hierarchy<R>

// export const eq = <R extends T.Root>(): Eq<Hierarchy<R>> => ({
//   equals: (a, b) => {
//     if (a.length !== b.length) {
//       return false
//     }

//     return pipe(
//       A.zip(a, b),
//       A.every(([a, b]) => isSameDetails(a, b)),
//     )
//   },
// })

// const showDetails = (ds: (T.Details | T.DetailsTrash)[]) => {
//   return `${ds.map(d => T.isRegularDetails(d) ? T.fileName(d) : T.isTrashDetails(d) ? 'Trash' : '/').join(' → ')}`
// }

// export const match = <R, Result>(
//   onValid: (h: Hierarchy<R>) => Result,
//   // onInvalid: (rest: NEA<string>) => Result,
//   onPartial: (h: Hierarchy<R>, rest: NEA<string>) => Result,
// ) =>
//   (p: PathValidation<R>): Result => {
//     if (isValid(p)) {
//       return onValid(p.details)
//     }
//     return onPartial(p.details, p.rest)
//     // return onInvalid(p.rest)
//   }

// export const showMaybeValidPath = <R extends T.Root>(p: PathValidation<R>): string => {
//   return pipe(
//     p,
//     match(
//       (details) => `valid: [${showDetails(details)}]`,
//       // (rest) => `invalid: rest ${rest}`,
//       (details, rest) => `partial. valid: [${showDetails(details)}], rest: [${rest}]`,
//     ),
//   )
// }