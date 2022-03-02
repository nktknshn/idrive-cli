import * as E from 'fp-ts/Either'
import { flow, hole, pipe } from 'fp-ts/lib/function'
import { Predicate } from 'fp-ts/lib/Predicate'
import * as SRTE from 'fp-ts/lib/StateReaderTaskEither'
import * as TE from 'fp-ts/TaskEither'
import { BadRequestError, err, InvalidGlobalSessionError, MissingResponseBody } from '../../../lib/errors'
import { HttpResponse } from '../../../lib/http/fetch-client'
import { NEA } from '../../../lib/types'
import { AuthorizedState, authorizeSessionM } from '../../authorization/authorize'
import { authorizationHeaders } from '../../authorization/headers'
import { apiHttpRequest, applyCookiesToSession, HttpRequestConfig } from '../../session/session-http'
import { headers } from '../../session/session-http-headers'
import { getMissedFound } from '../helpers'
import * as RQ from '../requests'
import { AuthorizedRequest, RequestEnv, State } from '../requests/request'
import * as T from '../requests/types/types'

export const assertThat = (pred: Predicate<HttpResponse>, onError: (resp: HttpResponse) => Error) =>
  <T extends { httpResponse: HttpResponse }>(context: TE.TaskEither<Error, T>) =>
    pipe(
      // E.of(context.httpResponse),
      context,
      TE.filterOrElse(_ => pred(_.httpResponse), v => onError(v.httpResponse)),
      // pred(httpResponse) ? E.of(httpResponse) : E.left(err(`failed`)),
    )

export const checkStatuses = (validStatuses = [200]) =>
  <T extends { httpResponse: HttpResponse }>(context: TE.TaskEither<Error, T>) =>
    pipe(
      // E.of(context.httpResponse),
      context,
      assertThat(r => r.status !== 421, (h) => InvalidGlobalSessionError.create(h)),
      assertThat(r => r.status !== 400, (h) => BadRequestError.create(h)),
      assertThat(r => validStatuses.includes(r.status), (h) => err(`wrong status: ${h.status}`)),
      // pred(httpResponse) ? E.of(httpResponse) : E.left(err(`failed`)),
    )

import * as t from 'io-ts'
import { defaultApiEnv } from '../../../defaults'
import { tryJsonFromResponse } from '../../../lib/http/json'
import { arrayFromOption } from '../../../lib/util'
import { applyAuthorizationResponse } from '../../authorization/session'
import { getResponse } from '../../authorization/signin'
import { ICloudSession } from '../../session/session'
import { reporter } from '../requests/http'

export const readJsonEither = <T extends { httpResponse: HttpResponse }>() =>
  (context: TE.TaskEither<Error, T>) =>
    pipe(
      context,
      TE.chainW((ctx) =>
        pipe(
          tryJsonFromResponse(ctx.httpResponse),
          TE.fold(
            (e) => TE.of(E.left(e)),
            json => TE.of(E.right(json)),
          ),
          TE.map(json => ({ ...ctx, json })),
        )
      ),
    )

export const tryDecodeJson = <T extends { httpResponse: HttpResponse; json: E.Either<Error, unknown> }, A>(
  decode: (u: unknown) => t.Validation<A>,
) =>
  (context: TE.TaskEither<Error, T>) =>
    pipe(
      context,
      TE.map((ctx) =>
        pipe(
          ctx.json,
          E.chain(flow(
            decode,
            E.mapLeft(errors => err(`Error decoding json: ${reporter(E.left(errors))}`)),
          )),
          decoded => ({ ...ctx, decoded }),
        )
      ),
    )

export const requireJson = <T extends { httpResponse: HttpResponse; json: E.Either<Error, unknown> }, A>(
  decode: (u: unknown) => t.Validation<A>,
) =>
  (context: TE.TaskEither<Error, T>): TE.TaskEither<
    Error,
    T & {
      json: unknown
      decoded: A
    }
  > =>
    pipe(
      context,
      TE.chainW(ctx =>
        pipe(
          TE.fromEither(ctx.json),
          TE.chainW(json =>
            pipe(
              TE.fromEither(
                pipe(decode(json), E.mapLeft(errors => err(`Error decoding json: ${reporter(E.left(errors))}`))),
              ),
              TE.map(decoded => ({ ...ctx, json, decoded })),
            )
          ),
        )
      ),
    )

export const handleResponse = <S extends { session: ICloudSession }, T extends { httpResponse: HttpResponse }>(
  handler: (context: T) => (state: S) => TE.TaskEither<Error, S>,
) => (context: T) => (state: S) => pipe(context, handler)(state)

export const applyToSession = <
  S extends { session: ICloudSession },
>(
  f: (httpResponse: HttpResponse) => (session: ICloudSession) => ICloudSession,
) =>
  <T extends { httpResponse: HttpResponse }>(context: T) =>
    (state: S): TE.TaskEither<Error, S> => {
      return TE.of({
        ...state,
        session: f(context.httpResponse)(state.session),
      })
    }

export const result = <S extends { session: ICloudSession }, T extends { httpResponse: HttpResponse }, A>(
  handler: (context: T) => (oldstate: S) => (state: S) => TE.TaskEither<Error, A>,
) => (context: T) => (state: S) => pipe(context, handler)(state)

export const request = <args extends unknown[], S extends State, T extends { httpResponse: HttpResponse }, A>(
  req: Request<args, S, T, A>,
): Request<args, S, T, A> => req

export interface Request<args extends unknown[], S extends State, T extends { httpResponse: HttpResponse }, A> {
  constructor: (...args: args) => (state: S) => TE.TaskEither<Error, HttpRequestConfig>
  decodeResponse: (httpResponse: HttpResponse) => TE.TaskEither<
    Error,
    T
  >
  handleResponse: (context: T) => (state: S) => TE.TaskEither<Error, S>
  result: (context: T) => (oldstate: S) => (state: S) => TE.TaskEither<Error, A>
}

export type Executor = <
  TArgs extends unknown[],
  S extends State,
  T extends {
    httpResponse: HttpResponse
  },
  A,
>(
  req: Request<TArgs, S, T, A>,
) => <S2 extends S>(...args: TArgs) => SRTE.StateReaderTaskEither<S2, {}, Error, A>

export const executor = (env: RequestEnv & {}) =>
  <TArgs extends unknown[], S extends State, T extends { httpResponse: HttpResponse }, A>(
    req: Request<TArgs, S, T, A>,
  ): <S2 extends S>(...args: TArgs) => SRTE.StateReaderTaskEither<S2, {}, Error, A> => {
    return <S2 extends S>(...args: TArgs) =>
      (s: S2) =>
        () => {
          const executeRequest = (s: S2) =>
            pipe(
              TE.of<Error, { env: RequestEnv }>({ env }),
              TE.bind('state', () => TE.of(s)),
              TE.bind('request', ({ state }) =>
                pipe(
                  req.constructor(...args)(state),
                  TE.map(r => apiHttpRequest(r.method, r.url, r.options)(state)),
                )),
              TE.bind('response', ({ env, request }) => (env.fetch(request))),
              TE.bind('context', ({ response }) => (req.decodeResponse(response))),
              TE.bind('newstate', ({ context, state }) => (req.handleResponse(context)(state))),
              TE.chainW(({ context, newstate, state, response, request }) =>
                pipe(
                  req.result(context)(state)(newstate),
                  TE.map((res) => [res, { ...s, ...newstate }] as [A, S2]),
                )
              ),
            )

          return pipe(
            executeRequest(s),
            TE.orElse(e =>
              InvalidGlobalSessionError.is(e)
                ? pipe(
                  authorizeSessionM<S2>()(s)(defaultApiEnv),
                  TE.chain(([, s]) => executeRequest(s)),
                )
                : TE.left(e)
            ),
          )
        }
  }
