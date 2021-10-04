import * as O from "fp-ts/lib/Option";
import * as A from "fp-ts/lib/Array";
import { flow } from "fp-ts/lib/function";
import * as E from 'fp-ts/lib/Either'
import { pipe } from 'fp-ts/lib/function'
import * as TE from 'fp-ts/lib/TaskEither'
import * as T from 'fp-ts/lib/Task'


export function isObject(a: unknown): a is object {
    return typeof a === 'object' && a !== null
}

export function hasOwnProperty<X extends {}, Y extends PropertyKey>
    (obj: X, prop: Y): obj is X & Record<Y, unknown> {
    return obj.hasOwnProperty(prop)
}

export function getObjectProperty<X extends {}, Y extends PropertyKey>
    (a: unknown, prop: Y): O.Option<X & Record<Y, unknown>> {
    if (isObject(a) && hasOwnProperty(a, prop)) {
        return O.some(a as X & Record<Y, unknown>)
    }

    return O.none
}


export function isObjectWithOwnProperty<X extends {}, Y extends PropertyKey>
    (a: unknown, prop: Y): a is X & Record<Y, unknown> {
    return isObject(a) && a.hasOwnProperty(prop)
}

export const separateEithers = flow(
    A.separate,
    ({ left, right }) => [left, right] as const
)

import * as R from 'fp-ts/lib/Record'

import { last } from 'fp-ts/Semigroup'

export const buildRecord = R.fromFoldable(last<string>(), A.Foldable)


const eitherAsTuple = <E, A>(e: E.Either<E, A>): readonly [undefined, A] | readonly [E, undefined] => {
    return pipe(
        e,
        E.foldW((e) => [e, undefined] as const, v => [undefined, v] as const)
    )
}

const taskEitherasTuple = <E, A>(e: TE.TaskEither<E, A>): T.Task<readonly [undefined, A] | readonly [E, undefined]> => {
    return () => e().then(eitherAsTuple)
}