import { Refinement } from 'fp-ts/lib/Refinement'
import { isString } from 'fp-ts/lib/string'

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
