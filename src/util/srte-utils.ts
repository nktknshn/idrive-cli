import { sequenceS, sequenceT } from 'fp-ts/lib/Apply'
import { flow, pipe } from 'fp-ts/lib/function'
import { IO } from 'fp-ts/lib/IO'
import * as SRTE from 'fp-ts/lib/StateReaderTaskEither'
import * as TE from 'fp-ts/TaskEither'

export const orElse = <S, R, E1, A, E2>(onLeft: (e: E1) => SRTE.StateReaderTaskEither<S, R, E2, A>) =>
  (ma: SRTE.StateReaderTaskEither<S, R, E1, A>): SRTE.StateReaderTaskEither<S, R, E2, A> =>
    s => r => pipe(ma(s)(r), TE.orElse(e => onLeft(e)(s)(r)))

export const orElseW = <S, R, E1, A, E2, B>(onLeft: (e: E1) => SRTE.StateReaderTaskEither<S, R, E2, B>) =>
  (ma: SRTE.StateReaderTaskEither<S, R, E1, A>): SRTE.StateReaderTaskEither<S, R, E2, A | B> =>
    s => r => pipe(ma(s)(r), TE.orElseW(e => onLeft(e)(s)(r)))

export const orElseFirst = <S, R, E, A, _>(
  onLeft: (e: E) => SRTE.StateReaderTaskEither<S, R, E, _>,
) =>
  (ma: SRTE.StateReaderTaskEither<S, R, E, A>): SRTE.StateReaderTaskEither<S, R, E, A> =>
    s =>
      r =>
        pipe(
          ma(s)(r),
          TE.orElseFirst(e => onLeft(e)(s)(r)),
        )

export const orElseFirstW = <S, R, E1, A, E2, B>(onLeft: (e: E1) => SRTE.StateReaderTaskEither<S, R, E2, B>) =>
  (ma: SRTE.StateReaderTaskEither<S, R, E1, A>): SRTE.StateReaderTaskEither<S, R, E1 | E2, A> =>
    s => r => pipe(ma(s)(r), TE.orElseFirstW(e => onLeft(e)(s)(r)))

export const orElseTaskEither = <S, R, E1, A, E2>(onLeft: (e: E1) => TE.TaskEither<E2, A>) =>
  (ma: SRTE.StateReaderTaskEither<S, R, E1, A>): SRTE.StateReaderTaskEither<S, R, E2, A> =>
    s => r => pipe(ma(s)(r), TE.orElse(flow(onLeft, TE.map((a) => [a, s] as const))))

export const adoS = sequenceS(SRTE.Apply)
export const adoT = sequenceT(SRTE.Apply)

export const runLogging = (logfunc: IO<void>) =>
  <S, R, E, A>(ma: SRTE.StateReaderTaskEither<S, R, E, A>): SRTE.StateReaderTaskEither<S, R, E, A> =>
    pipe(logfunc, SRTE.fromIO, SRTE.chain(() => ma))
