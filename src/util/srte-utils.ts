import { sequenceS, sequenceT } from 'fp-ts/lib/Apply'
import { flow, pipe } from 'fp-ts/lib/function'
import * as SRTE from 'fp-ts/lib/StateReaderTaskEither'
import * as TE from 'fp-ts/TaskEither'

export const orElse = <S, R, E1, A, E2>(onLeft: (e: E1) => SRTE.StateReaderTaskEither<S, R, E2, A>) =>
  (ma: SRTE.StateReaderTaskEither<S, R, E1, A>): SRTE.StateReaderTaskEither<S, R, E2, A> =>
    s => r => pipe(ma(s)(r), TE.orElse(e => onLeft(e)(s)(r)))

export const orElseTaskEither = <S, R, E1, A, E2>(onLeft: (e: E1) => TE.TaskEither<E2, A>) =>
  (ma: SRTE.StateReaderTaskEither<S, R, E1, A>): SRTE.StateReaderTaskEither<S, R, E2, A> =>
    s => r => pipe(ma(s)(r), TE.orElse(flow(onLeft, TE.map((a) => [a, s] as const))))

export const adoS = sequenceS(SRTE.Apply)
export const adoT = sequenceT(SRTE.Apply)
