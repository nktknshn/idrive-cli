import { sequenceS } from 'fp-ts/lib/Apply'
import { constant, constVoid, pipe } from 'fp-ts/lib/function'
import * as RTE from 'fp-ts/lib/ReaderTaskEither'
import * as SRTE from 'fp-ts/lib/StateReaderTaskEither'
import * as TE from 'fp-ts/lib/TaskEither'
import { InvalidGlobalSessionResponse } from '../../../lib/errors'
import { FetchClientEither, FetchError, HttpResponse } from '../../../lib/http/fetch-client'
import { authorizeSession, ICloudSessionValidated } from '../../authorization/authorize'
import { AccountLoginResponseBody } from '../../authorization/types'
import { ICloudSession } from '../../session/session'

export const executeRequest = <TArgs extends any[], R>(
  f: (client: FetchClientEither, session: ICloudSessionValidated, ...args: TArgs) => TE.TaskEither<Error, R>,
) => {
  return (...args: TArgs) =>
    pipe(
      readEnv,
      chain(({ client, session }) =>
        pipe(
          () =>
            pipe(
              f(client, session, ...args),
              fromTaskEither,
            ),
          f => catchInvalidSession(() => catchFetchErrors(5)(f)),
        )
      ),
    )
}
const ado = sequenceS(SRTE.Apply)
type State<S = ICloudSessionValidated> = { session: S }
type Env = {
  client: FetchClientEither
  getCode: () => TE.TaskEither<Error, string>
}

export type ApiM<T, S = ICloudSessionValidated> = SRTE.StateReaderTaskEither<State<S>, Env, Error, T>

export const map = SRTE.map
export const chain = <A, B>(f: (a: A) => ApiM<B>) => SRTE.chain(f)

export const fromTaskEither = <A>(te: TE.TaskEither<Error, A>): ApiM<A> => SRTE.fromTaskEither(te)

export const readEnv = ado({
  session: SRTE.gets<State, Env, Error, ICloudSessionValidated>(_ => _.session),
  client: SRTE.asks<State, Env, FetchClientEither, Error>(_ => _.client),
  env: SRTE.ask<State, Env>(),
})

const orElseTaskEitherW = <T1, T2>(
  f: (e: Error) => TE.TaskEither<Error, T2>,
) =>
  (m: ApiM<T1>): ApiM<T1 | T2> => {
    return (s) =>
      pipe(
        m(s),
        RTE.orElseW((e) =>
          pipe(
            f(e),
            TE.map((v): [T2, State] => [v, s]),
            RTE.fromTaskEither,
          )
        ),
      )
  }
const orElseW = <T1, T2>(
  f: (e: Error) => ApiM<T2>,
) => (m: ApiM<T1>): ApiM<T1 | T2> => (s) => pipe(m(s), RTE.orElseW((e) => f(e)(s)))
const catchErrors = <T>(
  m: () => ApiM<T>,
): ApiM<T> => {
  return pipe(
    m(),
    orElseW((e) => {
      return InvalidGlobalSessionResponse.is(e)
        ? pipe(
          onInvalidSession(),
          SRTE.chainW(m),
        )
        : catchErrors(m)
      // : SRTE.left(e)
    }),
  )
}
const catchInvalidSession = <T>(
  m: () => ApiM<T>,
): ApiM<T> => {
  return pipe(
    m(),
    orElseW((e) => {
      return InvalidGlobalSessionResponse.is(e)
        ? pipe(
          onInvalidSession(),
          SRTE.chainW(m),
        )
        : SRTE.left(e)
    }),
  )
}
const catchFetchErrors = (triesLeft: number) =>
  <T>(
    m: () => ApiM<T>,
  ): ApiM<T> => {
    return pipe(
      m(),
      orElseW((e) => {
        return FetchError.is(e) && triesLeft > 0
          ? catchFetchErrors(triesLeft - 1)(m)
          : SRTE.left(e)
      }),
    )
  }
/**
 * tries to authorize the session storing the updated one
 */
const onInvalidSession = (): ApiM<void> => {
  return pipe(
    readEnv,
    chain(({ client, session, env }) =>
      pipe(
        authorizeSession(client, session.session, { getCode: env.getCode() }),
        fromTaskEither,
      )
    ),
    storeSessionAndReturn(constVoid),
  )
}
const storeSessionAndReturn = <
  T extends {
    session: ICloudSession
    accountData?: AccountLoginResponseBody
  },
  R,
>(
  f: (a: T) => R,
) =>
  (m: ApiM<T>): ApiM<R> => {
    return pipe(
      m,
      chain((a) =>
        pipe(
          readEnv,
          chain(({ session: { accountData } }) =>
            pipe(
              SRTE.put({
                session: {
                  session: a.session,
                  accountData: a.accountData ?? accountData,
                },
              }),
              map(constant(f(a))),
            )
          ),
        )
      ),
    )
  }
export const storeSessionAndReturnBody = <
  T extends {
    session: ICloudSession
    accountData?: AccountLoginResponseBody
    response: {
      httpResponse: HttpResponse
      body: R
    }
  },
  R,
>() => (m: ApiM<T>): ApiM<R> => storeSessionAndReturn<T, R>(({ response }) => response.body)(m)
