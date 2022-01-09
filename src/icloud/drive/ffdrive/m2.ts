import * as E from 'fp-ts/lib/Either'
import { hole, pipe } from 'fp-ts/lib/function'
import * as O from 'fp-ts/lib/Option'
import * as SRTE from 'fp-ts/lib/StateReaderTaskEither'
import * as T from 'fp-ts/lib/Task'
import * as TE from 'fp-ts/lib/TaskEither'

export type ESRTE<S, R, E, A> = SRTE.StateReaderTaskEither<S, R, Err<S, E>, A>

export type Err<S, E> = E

export const get = <S, R, E = never>() => {
  type T_<A, S_ extends S = S> = ESRTE<S_, R, E, A>

  const Do = SRTE.of<S, R, Err<S, E>, {}>({})
  const chain = <A, B, S_ extends S>(f: (a: A) => T_<B, S_>): (ma: T_<A, S_>) => T_<B, S_> => SRTE.chain(f)

  const of = <A, S_ extends S>(v: A): T_<A, S_> => SRTE.of<S_, R, Err<S_, E>, A>(v)

  const get: <S_ extends S>() => ESRTE<S_, R, E, S_> = SRTE.get

  const left = <A = never, S_ extends S = S>(e: E): T_<A, S_> =>
    pipe(
      get<S_>(),
      chain(state => SRTE.left(e)),
    )
  const leftE = <A = never, S_ extends S = S>(e: Err<S_, E>): T_<A, S_> => SRTE.left(e)
  const fromTaskEither = <A, S_ extends S>(te: TE.TaskEither<E, A>): T_<A, S_> =>
    (state: S_) =>
      (env: R) =>
        pipe(
          te,
          TE.bimap(
            error => (error),
            (v): [A, S_] => [v, state],
          ),
        )

  const fromTaskEitherE = <A, S_ extends S, S2, E2>(f: (e: Err<S2, E2>) => T_<A, S_>) =>
    (te: TE.TaskEither<Err<S2, E2>, A>): T_<A, S_> =>
      (state: S_) =>
        (env: R) =>
          pipe(
            te,
            T.chain(E.fold(
              (error) => f(error)(state)(env),
              (v) => T.of(E.right([v, state])),
            )),
          )

  const fromOption = <A, S_ extends S>(f: () => E) =>
    (opt: O.Option<A>): T_<A, S_> => pipe(opt, O.fold(() => left(f()), of))

  const fromEither = <A, S_ extends S = S>(e: E.Either<E, A>): T_<A, S_> =>
    pipe(e, E.match(e => left(e), a => of<A, S_>(a)))

  const map = SRTE.map

  return {
    Do,
    chain,
    of,
    get,
    left,
    fromEither,
    fromTaskEither,
    fromOption,
    map,
    fromTaskEitherE,
    leftE,
  }
}
