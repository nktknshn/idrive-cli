import * as A from 'fp-ts/lib/Array'
import * as E from 'fp-ts/lib/Either'
import { flow } from 'fp-ts/lib/function'
import { pipe } from 'fp-ts/lib/function'
import * as O from 'fp-ts/lib/Option'
import * as T from 'fp-ts/lib/Task'
import * as TE from 'fp-ts/lib/TaskEither'
import Path from 'path'

export { Path }
export const cast = <T>() => <R extends T>(v: R): T => v

export type ObjectType = {}

export function isObject(a: unknown): a is ObjectType {
  return typeof a === 'object' && a !== null
}

export function hasOwnProperty<X extends ObjectType, Y extends PropertyKey>(
  obj: X,
  prop: Y,
): obj is X & Record<Y, unknown> {
  return prop in obj
}

type WithKeys<Y extends PropertyKey[]> = Y extends [infer X, ...infer R]
  ? X extends PropertyKey ? R extends PropertyKey[] ? Record<X, unknown> & WithKeys<R> : {} : {}
  : {}

export function hasOwnProperties<X extends ObjectType, Y extends PropertyKey[]>(
  obj: X,
  ...props: Y
): obj is X & WithKeys<Y> {
  for (const p of props) {
    if (!(p in obj)) {
      return false
    }
  }

  return true
}

export function getObjectProperty<X extends ObjectType, Y extends PropertyKey>(
  a: unknown,
  prop: Y,
): O.Option<X & Record<Y, unknown>> {
  if (isObject(a) && hasOwnProperty(a, prop)) {
    return O.some(a as X & Record<Y, unknown>)
  }

  return O.none
}

export function isObjectWithOwnProperty<
  X extends ObjectType,
  Y extends PropertyKey,
>(a: unknown, prop: Y): a is X & Record<Y, unknown> {
  return isObject(a) && prop in a
}

export const separateEithers = flow(
  A.separate,
  ({ left, right }) => [left, right] as const,
)

import * as R from 'fp-ts/lib/Record'

import { isString } from 'fp-ts/lib/string'
import { last } from 'fp-ts/Semigroup'

export const buildRecord = R.fromFoldable(last<string>(), A.Foldable)
export const recordFromTuples = <T, K extends string>(ts: (readonly [K, T])[]): Record<string, T> => {
  const obj: any = {}

  for (const [k, v] of ts) {
    obj[k] = v
  }

  return obj
}

export const arrayFromOption = <T>(opt: O.Option<T>) => pipe(opt, O.fold(() => [], (v) => [v]))

export function splitPair(
  sep: string,
  keyVal: string,
): O.Option<readonly [string, string]> {
  return pipe(
    O.fromNullable(new RegExp(`(.*?)${sep}(.*)`).exec(keyVal)),
    O.map(([_, ...vs]) => [vs[0], vs[1]] as const),
  )
}

import { Refinement } from 'fp-ts/lib/Refinement'
import { Readable } from 'stream'
import { NEA } from './types'

export function consumeStreamToString(readable: Readable): TE.TaskEither<Error, string> {
  return TE.fromTask<string, Error>(async () => {
    let data = ''
    for await (const chunk of readable) {
      data += chunk
    }
    return data
  })
}

export const sequenceArrayNEA: <E, A>(as: NEA<E.Either<E, A>>) => E.Either<E, NEA<A>> = E.sequenceArray as any

export function guardSndRO<A, B, F extends B>(
  refinement: Refinement<B, F>,
): (tuple: readonly [A, B]) => tuple is readonly [A, F] {
  return (tuple: readonly [A, B]): tuple is readonly [A, F] => refinement(tuple[1])
}

export function guardSnd<A, B, F extends B>(
  refinement: Refinement<B, F>,
): (tuple: [A, B]) => tuple is [A, F] {
  return (tuple: [A, B]): tuple is [A, F] => refinement(tuple[1])
}

export function guardFst<A, B, F extends A>(
  refinement: Refinement<A, F>,
): (tuple: [A, B]) => tuple is [F, B] {
  return (tuple: [A, B]): tuple is [F, B] => refinement(tuple[0])
}

export function guardFstRO<A, B, F extends A>(
  refinement: Refinement<A, F>,
): (tuple: readonly [A, B]) => tuple is readonly [F, B] {
  return (tuple: readonly [A, B]): tuple is readonly [F, B] => refinement(tuple[0])
}

export const guardThird = <A, B, C, F extends C>(refinement: Refinement<C, F>) =>
  (tuple: [A, B, C]): tuple is [A, B, F] => refinement(tuple[2])

export const isDefined = <A>(a: A | undefined): a is A => !!a

export function guardProp<A, B extends R[K], R, K extends keyof R>(
  key: K,
  refinement: Refinement<R[K], B>,
) {
  return (rec: R): rec is R & Record<K, B> => refinement(rec[key])
}
export const isKeyOf = <R extends Record<string, unknown>>(
  commands: R,
  command: string | number | symbol,
): command is (keyof R) => {
  if (!isString(command)) {
    return false
  }

  return Object.keys(commands).includes(command)
}