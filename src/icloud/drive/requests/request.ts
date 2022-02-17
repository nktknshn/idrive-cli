import { sequenceS } from 'fp-ts/lib/Apply'
import * as E from 'fp-ts/lib/Either'
import { constant, flow, pipe } from 'fp-ts/lib/function'
import * as R from 'fp-ts/lib/Reader'
import * as RTE from 'fp-ts/lib/ReaderTaskEither'
import * as SRTE from 'fp-ts/lib/StateReaderTaskEither'
import * as TE from 'fp-ts/lib/TaskEither'
import * as t from 'io-ts'
import { BadRequestError, err, InvalidGlobalSessionError, MissingResponseBody } from '../../../lib/errors'
import { FetchClientEither, HttpRequest, HttpResponse } from '../../../lib/http/fetch-client'
import { tryJsonFromResponse } from '../../../lib/http/json'
import { apiLogger, logg } from '../../../lib/logging'
import { ICloudSessionValidated } from '../../authorization/authorize'
import { AccountLoginResponseBody } from '../../authorization/types'
import { ICloudSession } from '../../session/session'
import { apiHttpRequest, applyCookiesToSession, HttpRequestConfig } from '../../session/session-http'
import * as ESRTE from '../ffdrive/m2'
import * as H from './http'

export type AuthorizedRequest<R> = ApiRequest<R, ICloudSessionValidated>

export type AuthorizationState = {
  session: ICloudSession
  accountData: AccountLoginResponseBody
}

export type AuthorizationApiRequest<R> = ApiRequest<R, AuthorizationState>

// export type ReaderRequest<T> = R.Reader<
//   { client: FetchClientEither; session: ICloudSessionValidated },
//   TE.TaskEither<Error, H.ResponseWithSession<T>>
// >

export type Env = {
  fetch: FetchClientEither
  getCode: () => TE.TaskEither<Error, string>
}

export type State = { session: ICloudSession }

/** API context */
export type ApiRequest<A, S extends State = never> = ESRTE.ESRTE<S, Env, Error, A>

interface ValidHttpResponseBrand {
  readonly ValidHttpResponse: unique symbol
}

type ValidHttpResponse<R extends { httpResponse: HttpResponse }> = t.Branded<R, ValidHttpResponseBrand>

type Filter<S extends State> = (
  ma: ApiRequest<{ httpResponse: HttpResponse }, S>,
) => ApiRequest<{ httpResponse: HttpResponse }, S>

export const {
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

const putSession = <S extends { session: ICloudSession }>(session: ICloudSession): ApiRequest<void, S> =>
  pipe(
    readEnv<S>(),
    chain(({ state }) => SRTE.put({ ...state, session })),
  )

export const buildRequest = <S extends State>(
  f: (a: { state: S; env: Env }) => R.Reader<{ state: S }, HttpRequest>,
): ApiRequest<HttpRequest, S> =>
  pipe(
    readEnv<S>(),
    map(f),
    chain(reader => pipe(readEnv<S>(), map(reader))),
  )

export const buildRequestC = <S extends { session: ICloudSession }>(
  f: (a: { state: S; env: Env }) => HttpRequestConfig,
): ApiRequest<HttpRequest, S> =>
  pipe(
    readEnv<S>(),
    map(env =>
      pipe(
        f(env),
        config => apiHttpRequest(config.method, config.url, config.options)(env.state),
      )
    ),
    // chain(config =>
    //   pipe(
    //     readEnv<S>(),
    //     map(_ => apiHttpRequest(config.method, config.url, config.options)(_.state)),
    //   )
    // ),
  )

export const buildRequestE = <S extends { session: ICloudSession }>(
  f: (a: { state: S; env: Env }) => ApiRequest<R.Reader<{ session: ICloudSession }, HttpRequest>, S>,
): ApiRequest<HttpRequest, S> =>
  pipe(
    readEnv<S>(),
    chain(f),
    chain(reader => pipe(readEnv<S>(), map(s => reader(s.state)))),
  )

export const fetch = <S extends State>(
  req: ApiRequest<HttpRequest, S>,
) => {
  return pipe(
    readEnv<S>(),
    SRTE.bindW('req', () => req),
    chain(({ req, env: { fetch } }) => fromTaskEither(fetch(req))),
  )
}

export const handleResponse = <R, S extends State>(
  f: (ma: ApiRequest<{ httpResponse: HttpResponse }, S>) => ApiRequest<R, S>,
) =>
  (
    req: ApiRequest<HttpRequest, S>,
  ): ApiRequest<R, S> =>
    pipe(
      readEnv<S>(),
      SRTE.bind('req', () => req),
      chain(({ env: { fetch }, req }) =>
        fromTaskEither(pipe(
          logg(req.url, apiLogger.debug),
          () => fetch(req),
          TE.map(httpResponse => ({ httpResponse })),
        ))
      ),
      f,
    )

export const filterHttpResponse = <R extends { httpResponse: HttpResponse }, S extends State = never>(
  f: (r: R) => E.Either<Error, R>,
) => (ma: ApiRequest<R, S>) => pipe(ma, chain(a => fromEither(f(a))))

export const handleInvalidSession = <S extends State>(): Filter<S> =>
  filterHttpResponse(
    (r) =>
      r.httpResponse.status == 421
        ? E.left(InvalidGlobalSessionError.create(r.httpResponse))
        : E.of(r),
  )

export const handleBadRequest = <S extends State>(): Filter<S> =>
  filterHttpResponse(
    (r) =>
      r.httpResponse.status == 400
        ? E.left(BadRequestError.create(r.httpResponse))
        : E.of(r),
  )

const handleStatus = <R extends { httpResponse: HttpResponse }, S extends State = never>(validStatuses: number[]) =>
  filterHttpResponse<R, S>(
    (r) =>
      validStatuses.includes(r.httpResponse.status)
        ? E.of(r)
        : E.left(err(`invalid status ${r.httpResponse.status}`)),
  )

export const validateHttpResponse = <R extends { httpResponse: HttpResponse }, S extends State>(
  { validStatuses }: { validStatuses: number[] } = { validStatuses: [200, 204] },
) =>
  (ma: ApiRequest<R, S>): ApiRequest<ValidHttpResponse<R>, S> =>
    pipe(
      ma,
      handleInvalidSession(),
      handleBadRequest(),
      handleStatus(validStatuses),
      map(_ => _ as ValidHttpResponse<R>),
    )

export const decodeJson = <T extends { httpResponse: HttpResponse }, R, S extends State>(
  decode: (u: unknown) => t.Validation<R>,
) =>
  (
    ma: ApiRequest<ValidHttpResponse<T>, S>,
  ): ApiRequest<
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
    ma: ApiRequest<ValidHttpResponse<T>, S>,
  ): ApiRequest<
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
    ma: ApiRequest<ValidHttpResponse<T>, S>,
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
  jsonDecoder: t.Decode<unknown, R>,
) => {
  return flow(
    validateHttpResponse<T, S>(),
    decodeJson(jsonDecoder),
    applyCookies(),
    map(_ => _.decoded),
  )
}

export const basicDriveJsonRequest = <R>(
  f: (a: { state: ICloudSessionValidated; env: Env }) => HttpRequestConfig,
  jsonDecoder: t.Decode<unknown, R>,
) => {
  return pipe(
    buildRequestC(f),
    handleResponse(basicJsonResponse(jsonDecoder)),
  )
}

export const orElse = <R, S extends State>(
  onError: (e: ESRTE.Err<S, Error>) => ApiRequest<R, S>,
) =>
  (
    ma: ApiRequest<R, S>,
  ): ApiRequest<R, S> => {
    return (s: S) =>
      pipe(
        ma(s),
        RTE.orElse(e => onError(e)(s)),
      )
  }
