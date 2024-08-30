/**
 * @since 0.5.0
 */
import { isNonEmpty } from 'fp-ts/lib/Array'
import { chain } from 'fp-ts/lib/Either'
import { fromArray, map, NonEmptyArray } from 'fp-ts/lib/NonEmptyArray'
import { isNone } from 'fp-ts/lib/Option'
import { pipe } from 'fp-ts/lib/pipeable'
import * as t from 'io-ts'

/**
 * @since 0.5.0
 */
// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export interface NonEmptyArrayC<C extends t.Mixed>
  extends t.Type<NonEmptyArray<t.TypeOf<C>>, NonEmptyArray<t.OutputOf<C>>, unknown>
{}

/**
 * @since 0.5.0
 */
export function nonEmptyArray<C extends t.Mixed>(
  codec: C,
  name: string = `NonEmptyArray<${codec.name}>`,
): NonEmptyArrayC<C> {
  const arr = t.array(codec)
  return new t.Type(
    name,
    (u): u is NonEmptyArray<t.TypeOf<C>> => arr.is(u) && isNonEmpty(u),
    (u, c) =>
      pipe(
        arr.validate(u, c),
        chain(as => {
          const onea = fromArray(as)
          return isNone(onea) ? t.failure(u, c) : t.success(onea.value)
        }),
      ),
    map(codec.encode),
  )
}
