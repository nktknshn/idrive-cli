import * as t from 'fp-ts-contrib/lib/time'
import { pipe } from 'fp-ts/lib/function'
import * as RTE from 'fp-ts/lib/ReaderTaskEither'
import * as TE from 'fp-ts/lib/TaskEither'

export const timeTE = t.time(TE.MonadTask)

type Logger = (msg: string) => () => void

export const logTimeTE = (logger: Logger) =>
  (name: string) =>
    <E, A>(te: TE.TaskEither<E, A>): TE.TaskEither<E, A> => {
      return pipe(
        timeTE(te),
        TE.chainFirstIOK(([_, ms]) => logger(`Running ${name} took ${ms} ms`)),
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
