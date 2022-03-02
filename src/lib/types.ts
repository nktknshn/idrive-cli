import * as SRTE from 'fp-ts/lib/StateReaderTaskEither'

import * as NA from 'fp-ts/lib/NonEmptyArray'

export type EmptyObject = Record<string, never>
export type NEA<A> = NA.NonEmptyArray<A>
export type SSSS<S, R, E, A> = SRTE.StateReaderTaskEither<S, R, E, A>
export type XXX<S, R, A> = SRTE.StateReaderTaskEither<S, R, Error, A>
export type XX<S, A> = SRTE.StateReaderTaskEither<S, {}, Error, A>
