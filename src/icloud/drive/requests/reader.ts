import { sequenceS } from 'fp-ts/lib/Apply'
import * as E from 'fp-ts/lib/Either'
import { constant, flow, pipe } from 'fp-ts/lib/function'
import * as R from 'fp-ts/lib/Reader'
import * as RTE from 'fp-ts/lib/ReaderTaskEither'
import * as SRTE from 'fp-ts/lib/StateReaderTaskEither'
import * as TE from 'fp-ts/lib/TaskEither'
import * as t from 'io-ts'
import { BadRequestError, err, InvalidGlobalSessionResponse, MissingResponseBody } from '../../../lib/errors'
import { FetchClientEither, HttpRequest, HttpResponse } from '../../../lib/http/fetch-client'
import { tryJsonFromResponse } from '../../../lib/http/json'
import { ICloudSessionValidated } from '../../authorization/authorize'
import { AccountLoginResponseBody } from '../../authorization/types'
import { ICloudSession } from '../../session/session'
import { apiHttpRequest, applyCookiesToSession, HttpRequestConfig } from '../../session/session-http'
import * as ESRTE from '../ffdrive/m2'
import * as H from './http'

export type DriveApiRequest<R> = ApiSessionRequest<R, ICloudSessionValidated>

export type AuthorizationState = {
  session: ICloudSession
  accountData: AccountLoginResponseBody
}

export type AuthorizationApiRequest<R> = ApiSessionRequest<R, AuthorizationState>

// export type ReaderRequest<T> = R.Reader<
//   { client: FetchClientEither; session: ICloudSessionValidated },
//   TE.TaskEither<Error, H.ResponseWithSession<T>>
// >

export type Env = {
  fetch: FetchClientEither
  getCode: () => TE.TaskEither<Error, string>
}

export type State = { session: ICloudSession }

export type ApiSessionRequest<A, S extends State> = ESRTE.ESRTE<S, Env, Error, A>

interface ValidHttpResponseBrand {
  readonly ValidHttpResponse: unique symbol
}

type ValidHttpResponse<R extends { httpResponse: HttpResponse }> = t.Branded<R, ValidHttpResponseBrand>

type Filter<S extends State> = (
  ma: ApiSessionRequest<{ httpResponse: HttpResponse }, S>,
) => ApiSessionRequest<{ httpResponse: HttpResponse }, S>

export const {
  Do: Do_,
  chain,
  leftE,
  fromEither,
  fromOption,
  fromTaskEither,
  get,
  left,
  map,
  of,
} = ESRTE.get<State, Env, Error>()

export const Do = <S extends State>() => of<{}, S>({})

const ado = sequenceS(SRTE.Apply)

export const readEnv = <S extends { session: ICloudSession }>() => ado({ state: get(), env: SRTE.ask<S, Env>() })

const putSession = <S extends { session: ICloudSession }>(session: ICloudSession): ApiSessionRequest<void, S> =>
  pipe(
    readEnv<S>(),
    chain(({ state }) => SRTE.put({ ...state, session })),
  )

export const buildRequest = <S extends State>(
  f: (a: { state: S; env: Env }) => R.Reader<{ state: S }, HttpRequest>,
): ApiSessionRequest<HttpRequest, S> =>
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
): ApiSessionRequest<HttpRequest, S> =>
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
  ): ApiSessionRequest<R, S> =>
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

export const filterHttpResponse = <R extends { httpResponse: HttpResponse }, S extends State>(
  f: (r: R) => E.Either<Error, R>,
) => (ma: ApiSessionRequest<R, S>) => pipe(ma, chain(a => fromEither(f(a))))

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

export const applyToSession = <T extends { httpResponse: HttpResponse }>(
  f: (a: ValidHttpResponse<T>) => (session: ICloudSession) => ICloudSession,
) =>
  <S extends State>(
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
  applyToSession<T>(({ httpResponse }) =>
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
  onError: (e: ESRTE.Err<S, Error>) => ApiSessionRequest<R, S>,
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
