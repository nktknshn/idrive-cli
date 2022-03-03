import * as RTE from 'fp-ts/lib/ReaderTaskEither'
import * as SRTE from 'fp-ts/lib/StateReaderTaskEither'

import * as NA from 'fp-ts/lib/NonEmptyArray'

export type EmptyObject = Record<string, never>
export type NEA<A> = NA.NonEmptyArray<A>
export type XXXX<S, R, E, A> = SRTE.StateReaderTaskEither<S, R, E, A>
export type XXX<S, R, A> = SRTE.StateReaderTaskEither<S, R, Error, A>
export type XX<S, A> = SRTE.StateReaderTaskEither<S, {}, Error, A>
export type RT<R, E, A> = RTE.ReaderTaskEither<R, E, A>
