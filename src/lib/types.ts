import * as NA from 'fp-ts/lib/NonEmptyArray'

export type EmptyObject = Record<string, never>
export type NEA<A> = NA.NonEmptyArray<A>
