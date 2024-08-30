import * as t from 'fp-ts-contrib/lib/time'
import { pipe } from 'fp-ts/lib/function'
import * as IO from 'fp-ts/lib/IO'
import * as RTE from 'fp-ts/lib/ReaderTaskEither'
import * as SRTE from 'fp-ts/lib/StateReaderTaskEither'
import * as TE from 'fp-ts/lib/TaskEither'

export const timeTE = t.time(TE.MonadTask)
export const timeIO = t.time(IO.MonadIO)

type Logger = (msg: string) => () => void

export const logTimeIO = (logger: Logger) =>
  (name: string) =>
    <A>(f: IO.IO<A>): IO.IO<A> =>
      pipe(
        timeIO(f),
        IO.chainFirst(([, ms]) => logger(`Running ${name} took ${ms} ms`)),
        IO.map(([res]) => res),
      )

export const logTimeTE = (logger: Logger) =>
  (name: string) =>
    <E, A>(te: TE.TaskEither<E, A>): TE.TaskEither<E, A> => {
      return pipe(
        timeTE(te),
        TE.chainFirstIOK(([, ms]) => logger(`Running ${name} took ${ms} ms`)),
        TE.map(([res]) => res),
      )
    }

export const logTimeRTE = (logger: Logger) =>
  (name: string) =>
    <R, E, A>(rte: RTE.ReaderTaskEither<R, E, A>): RTE.ReaderTaskEither<R, E, A> =>
      (r): TE.TaskEither<E, A> => {
        return pipe(
          rte(r),
          logTimeTE(logger)(name),
        )
      }

export const logTimeSRTE = (logger: Logger) =>
  (name: string) =>
    <S, R, E, A>(srte: SRTE.StateReaderTaskEither<S, R, E, A>): SRTE.StateReaderTaskEither<S, R, E, A> =>
      (s) => logTimeRTE(logger)(name)(srte(s))
