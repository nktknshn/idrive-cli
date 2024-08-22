import * as NA from 'fp-ts/lib/NonEmptyArray'
import * as RTE from 'fp-ts/lib/ReaderTaskEither'
import * as _SRTE from 'fp-ts/lib/StateReaderTaskEither'

// eslint-disable-next-line @typescript-eslint/ban-types
export type EmptyObject = {}
// Record<string, never>
export type UnknownObject = Record<string, unknown>

export type NEA<A> = NA.NonEmptyArray<A>

/** alias for StateReaderTaskEither */
export type SRTE<S, R, E, A> = _SRTE.StateReaderTaskEither<S, R, E, A>

/** alias for SRTE<S, R, E=Error, A> */
export type SRA<S, R, A> = _SRTE.StateReaderTaskEither<S, R, Error, A>

/** alias for SRTE<S, EmptyObject, Error, A> */
export type SA<S, A> = _SRTE.StateReaderTaskEither<S, EmptyObject, Error, A>

export type RT<R, E, A> = RTE.ReaderTaskEither<R, E, A>
