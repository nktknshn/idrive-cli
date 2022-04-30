import * as RTE from 'fp-ts/lib/ReaderTaskEither'
import * as SRTE from 'fp-ts/lib/StateReaderTaskEither'

import * as NA from 'fp-ts/lib/NonEmptyArray'

export type EmptyObject = Record<string, never>
export type UnknownObject = Record<string, unknown>

export type NEA<A> = NA.NonEmptyArray<A>

/** alias for SRTE */
export type XXXX<S, R, E, A> = SRTE.StateReaderTaskEither<S, R, E, A>

/** alias for SRTE<S, R, E=Error, A> */
export type XXX<S, R, A> = SRTE.StateReaderTaskEither<S, R, Error, A>

/** alias for SRTE<S, A> */
export type XX<S, A> = SRTE.StateReaderTaskEither<S, unknown, Error, A>

export type RT<R, E, A> = RTE.ReaderTaskEither<R, E, A>
