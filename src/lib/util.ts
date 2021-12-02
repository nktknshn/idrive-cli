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

export type ObjectType = Record<string, unknown>

export function isObject(a: unknown): a is ObjectType {
  return typeof a === 'object' && a !== null
}

export function hasOwnProperty<X extends ObjectType, Y extends PropertyKey>(
  obj: X,
  prop: Y,
): obj is X & Record<Y, unknown> {
  return prop in obj
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

const eitherAsTuple = <E, A>(
  e: E.Either<E, A>,
): readonly [undefined, A] | readonly [E, undefined] => {
  return pipe(
    e,
    E.foldW(
      (e) => [e, undefined] as const,
      (v) => [undefined, v] as const,
    ),
  )
}

const taskEitherasTuple = <E, A>(
  e: TE.TaskEither<E, A>,
): T.Task<readonly [undefined, A] | readonly [E, undefined]> => {
  return () => e().then(eitherAsTuple)
}

export const arrayFromOption = <T>(opt: O.Option<T>) =>
  pipe(
    opt,
    O.fold(
      () => [],
      (v) => [v],
    ),
  )

export function splitPair(
  sep: string,
  keyVal: string,
): O.Option<readonly [string, string]> {
  return pipe(
    O.fromNullable(new RegExp(`(.*?)${sep}(.*)`).exec(keyVal)),
    O.map(([_, ...vs]) => [vs[0], vs[1]] as const),
  )
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
