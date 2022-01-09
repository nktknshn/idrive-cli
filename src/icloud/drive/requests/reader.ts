import { sequenceS } from 'fp-ts/lib/Apply'
import * as E from 'fp-ts/lib/Either'
import { constant, flow, Lazy, pipe } from 'fp-ts/lib/function'
import * as O from 'fp-ts/lib/Option'
import * as R from 'fp-ts/lib/Reader'
import * as RTE from 'fp-ts/lib/ReaderTaskEither'
import { Refinement } from 'fp-ts/lib/Refinement'
import * as SRTE from 'fp-ts/lib/StateReaderTaskEither'
import * as TE from 'fp-ts/lib/TaskEither'
import * as t from 'io-ts'
import { BadRequestError, err, InvalidGlobalSessionResponse, MissingResponseBody } from '../../../lib/errors'
import { FetchClientEither, HttpRequest, HttpResponse } from '../../../lib/http/fetch-client'
import { tryJsonFromResponse } from '../../../lib/http/json'
import { ICloudSessionValidated } from '../../authorization/authorize'
import { AccountLoginResponseBody } from '../../authorization/types'
import { ICloudSession, session } from '../../session/session'
import { apiHttpRequest, applyCookiesToSession, HttpRequestConfig } from '../../session/session-http'
import * as H from './http'

export const Do = <S extends State>() => SRTE.of<S, Env, Error, {}>({})

export type ReaderRequest<T> = R.Reader<
  { client: FetchClientEither; session: ICloudSessionValidated },
  TE.TaskEither<Error, H.ResponseWithSession<T>>
>

export type Env = {
  fetch: FetchClientEither
  getCode: () => TE.TaskEither<Error, string>
}

export type State = { session: ICloudSession }

export type ApiSessionRequest<A, S extends State> = SRTE.StateReaderTaskEither<S, Env, Error, A>

const ado = sequenceS(SRTE.Apply)

export const readEnv = <S extends { session: ICloudSession }>() =>
  ado({
    state: SRTE.get<S, Env, Error>(),
    env: SRTE.ask<S, Env>(),
  })

export const fromTaskEither = <A, S extends State>(te: TE.TaskEither<Error, A>): ApiSessionRequest<A, S> =>
  SRTE.fromTaskEither(te)

export const fromEither = <A, S extends State>(te: E.Either<Error, A>): ApiSessionRequest<A, S> => SRTE.fromEither(te)

export const fromOption = <A, S extends State>(
  e: Lazy<Error>,
) => (opt: O.Option<A>): ApiSessionRequest<A, S> => SRTE.fromOption(e)(opt)

export const chain = <A, B, S extends State>(
  f: (a: A) => ApiSessionRequest<B, S>,
): (ma: ApiSessionRequest<A, S>) => ApiSessionRequest<B, S> => SRTE.chain(f)

export const of = <A, S extends State>(v: A): ApiSessionRequest<A, S> => SRTE.of(v)

export const left = <A, S extends State>(e: Error): ApiSessionRequest<A, S> => SRTE.left(e)

export const map = SRTE.map

const putSession = <S extends { session: ICloudSession }>(session: ICloudSession): ApiSessionRequest<void, S> =>
  pipe(
    readEnv<S>(),
    chain(({ state }) => SRTE.put({ ...state, session })),
  )

export const buildRequest = <S extends State>(
  f: (a: { state: S; env: Env }) => R.Reader<{ state: S }, HttpRequest>,
): SRTE.StateReaderTaskEither<S, Env, Error, HttpRequest> =>
  pipe(
    readEnv<S>(),
    map(f),
    chain(reader => pipe(readEnv<S>(), map(reader))),
  )

export const buildRequestC = <S extends { session: ICloudSession }>(
  f: (a: { state: S; env: Env }) => HttpRequestConfig,
): ApiSessionRequest<HttpRequest, S> =>
  pipe(
    readEnv<S>(),
    map(f),
    chain(config =>
      pipe(
        readEnv<S>(),
        map(_ => apiHttpRequest(config.method, config.url, config.options)(_.state)),
      )
    ),
  )

export const buildRequestE = <S extends { session: ICloudSession }>(
  f: (a: { state: S; env: Env }) => ApiSessionRequest<R.Reader<{ session: ICloudSession }, HttpRequest>, S>,
): SRTE.StateReaderTaskEither<S, Env, Error, HttpRequest> =>
  pipe(
    readEnv<S>(),
    chain(f),
    chain(reader => pipe(readEnv<S>(), map(s => reader(s.state)))),
  )

export const fetch = <S extends State>(
  req: ApiSessionRequest<HttpRequest, S>,
) => {
  return pipe(
    readEnv<S>(),
    SRTE.bindW('req', () => req),
    chain(({ req, env: { fetch } }) => fromTaskEither(fetch(req))),
  )
}

export const handleResponse = <R, S extends State>(
  f: (ma: ApiSessionRequest<{ httpResponse: HttpResponse }, S>) => ApiSessionRequest<R, S>,
) =>
  (
    req: ApiSessionRequest<HttpRequest, S>,
  ) =>
    pipe(
      readEnv<S>(),
      SRTE.bind('req', () => req),
      chain(({ env: { fetch }, req }) =>
        fromTaskEither(pipe(
          fetch(req),
          TE.map(httpResponse => ({ httpResponse })),
        ))
      ),
      f,
    )

type Filter<S extends State> = (
  ma: ApiSessionRequest<{ httpResponse: HttpResponse }, S>,
) => SRTE.StateReaderTaskEither<S, Env, Error, { httpResponse: HttpResponse }>

export const filterHttpResponse = <R extends { httpResponse: HttpResponse }, S extends State>(
  f: (r: R) => E.Either<Error, R>,
) => (ma: ApiSessionRequest<R, S>) => pipe(ma, chain<R, R, S>(SRTE.fromEitherK(f)))

export const handleInvalidSession = <S extends State>(): Filter<S> =>
  filterHttpResponse(
    (r) =>
      r.httpResponse.status == 421
        ? E.left(InvalidGlobalSessionResponse.create(r.httpResponse))
        : E.of(r),
  )
export const handleBadRequest = <S extends State>(): Filter<S> =>
  filterHttpResponse(
    (r) =>
      r.httpResponse.status == 400
        ? E.left(BadRequestError.create(r.httpResponse))
        : E.of(r),
  )

interface ValidHttpResponseBrand {
  readonly ValidHttpResponse: unique symbol
}

type ValidHttpResponse<R extends { httpResponse: HttpResponse }> = t.Branded<R, ValidHttpResponseBrand>

export const validateHttpResponse = <R extends { httpResponse: HttpResponse }, S extends State>(
  { statuses }: { statuses: number[] } = { statuses: [200, 204] },
) =>
  (ma: ApiSessionRequest<R, S>): ApiSessionRequest<ValidHttpResponse<R>, S> =>
    pipe(
      ma,
      handleInvalidSession(),
      handleBadRequest(),
      filterHttpResponse(
        (r) =>
          statuses.includes(r.httpResponse.status)
            ? E.of(r)
            : E.left(err(`invalid status ${r.httpResponse.status}`)),
      ),
      map(_ => _ as ValidHttpResponse<R>),
    )

export const decodeJson = <T extends { httpResponse: HttpResponse }, R, S extends State>(
  decode: (u: unknown) => t.Validation<R>,
) =>
  (
    ma: ApiSessionRequest<ValidHttpResponse<T>, S>,
  ): ApiSessionRequest<
    ValidHttpResponse<T & { readonly json: unknown; readonly httpResponse: HttpResponse; readonly decoded: R }>,
    S
  > =>
    pipe(
      ma,
      SRTE.bindW('json', (r: { httpResponse: HttpResponse }) => fromTaskEither(tryJsonFromResponse(r.httpResponse))),
      SRTE.bind('decoded', ({ json }) =>
        fromEither(pipe(
          decode(json),
          E.mapLeft(errors => err(`Error decoding json: ${H.reporter(E.left(errors))}`)),
        ))),
      map(_ =>
        _ as ValidHttpResponse<T & { readonly json: unknown; readonly httpResponse: HttpResponse; readonly decoded: R }>
      ),
    )

export const decodeJsonEither = <T extends { httpResponse: HttpResponse }, R, S extends State>(
  decode: (u: unknown) => t.Validation<R>,
) =>
  (
    ma: ApiSessionRequest<ValidHttpResponse<T>, S>,
  ): ApiSessionRequest<
    ValidHttpResponse<
      T & {
        readonly json: unknown
        readonly httpResponse: E.Either<MissingResponseBody, unknown>
        readonly decoded: E.Either<Error, R>
      }
    >,
    S
  > =>
    pipe(
      ma,
      SRTE.bindW(
        'json',
        (r: { httpResponse: HttpResponse }) =>
          fromTaskEither(pipe(
            tryJsonFromResponse(r.httpResponse),
            TE.fold(
              e => TE.of(E.left<MissingResponseBody, unknown>(e)),
              json => TE.of(E.right<MissingResponseBody, unknown>(json)),
            ),
          )),
      ),
      SRTE.bindW('decoded', ({ json }) =>
        of(pipe(
          json,
          E.chain(json =>
            pipe(
              decode(json),
              E.mapLeft(errors => err(`Error decoding json: ${H.reporter(E.left(errors))}`)),
            )
          ),
        ))),
      map(_ =>
        _ as ValidHttpResponse<
          T & {
            readonly json: unknown
            readonly httpResponse: E.Either<MissingResponseBody, unknown>
            readonly decoded: E.Either<Error, R>
          }
        >
      ),
    )

export const applyToSession = <T extends { httpResponse: HttpResponse }, S extends State>(
  f: (a: ValidHttpResponse<T>) => (session: ICloudSession) => ICloudSession,
) =>
  (
    ma: ApiSessionRequest<ValidHttpResponse<T>, S>,
  ) =>
    pipe(
      ma,
      chain(r =>
        pipe(
          readEnv<S>(),
          chain(({ state: { session } }) => putSession(f(r)(session))),
          map(constant(r)),
        )
      ),
    )

export const applyCookies = <T extends { httpResponse: HttpResponse }, S extends State>() =>
  applyToSession<T, S>(({ httpResponse }) =>
    flow(
      applyCookiesToSession(httpResponse),
    )
  )

export const basicJsonResponse = <T extends { httpResponse: HttpResponse }, S extends State, R>(
  decode: t.Decode<unknown, R>,
) => {
  return flow(
    validateHttpResponse<T, S>(),
    decodeJson(decode),
    applyCookies(),
    map(_ => _.decoded),
  )
}

export const basicDriveJsonRequest = <R>(
  f: (a: { state: ICloudSessionValidated; env: Env }) => HttpRequestConfig,
  decode: t.Decode<unknown, R>,
) => {
  return pipe(
    buildRequestC(f),
    handleResponse(basicJsonResponse(decode)),
  )
}

export const orElse = <R, S extends State>(
  onError: (e: Error) => ApiSessionRequest<R, S>,
) =>
  (
    ma: ApiSessionRequest<R, S>,
  ): ApiSessionRequest<R, S> => {
    return (s: S) =>
      pipe(
        ma(s),
        RTE.orElse(e => onError(e)(s)),
      )
  }

export type DriveApiRequest<R> = ApiSessionRequest<R, ICloudSessionValidated>

export type AuthorizationState = {
  session: ICloudSession
}

export type AuthorizationApiRequest<R> = ApiSessionRequest<R, AuthorizationState>
