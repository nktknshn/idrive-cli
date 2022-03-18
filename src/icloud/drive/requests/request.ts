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
import { AuthorizedState } from '../../authorization/authorize'
import { AccountLoginResponseBody } from '../../authorization/types'
import { ICloudSession } from '../../session/session'
import { apiHttpRequest, applyCookiesToSession, HttpRequestConfig } from '../../session/session-http'
import * as ESRTE from '../drive/m2'
import * as H from './http'

export type AuthorizedRequest<A, S = AuthorizedState, R = RequestEnv> = ApiRequest<A, S, R>

export type AuthorizationState = {
  session: ICloudSession
  accountData: AccountLoginResponseBody
}

export type AuthorizationApiRequest<R> = ApiRequest<R, AuthorizationState>

// export type ReaderRequest<T> = R.Reader<
//   { client: FetchClientEither; session: ICloudSessionValidated },
//   TE.TaskEither<Error, H.ResponseWithSession<T>>
// >

export type RequestEnv = {
  fetch: FetchClientEither
}

export type BasicState = {
  session: ICloudSession
}

/** API context */
export type ApiRequest<A, S, R = RequestEnv> = ESRTE.ESRTE<S, R, Error, A>

interface ValidHttpResponseBrand {
  readonly ValidHttpResponse: unique symbol
}

type ValidHttpResponse<R extends { httpResponse: HttpResponse }> = t.Branded<R, ValidHttpResponseBrand>

type Filter<S extends BasicState> = (
  ma: ApiRequest<{ httpResponse: HttpResponse }, S>,
) => ApiRequest<{ httpResponse: HttpResponse }, S>

export const { chain, leftE, fromEither, fromOption, fromTaskEither, get, left, map, of, filterOrElse } = ESRTE.get<
  BasicState,
  RequestEnv,
  Error
>()

export const Do = <S extends BasicState>() => of<{}, S>({})

const ado = sequenceS(SRTE.Apply)

export const readEnv = <S extends { session: ICloudSession }>() =>
  ado({ state: get<S>(), env: SRTE.ask<S, RequestEnv>() })

const putSession = <S extends { session: ICloudSession }>(session: ICloudSession): ApiRequest<void, S> =>
  pipe(
    readEnv<S>(),
    chain(({ state }) => SRTE.put({ ...state, session })),
  )

export const buildRequest = <S extends BasicState>(
  f: (a: { state: S; env: RequestEnv }) => R.Reader<{ state: S }, HttpRequest>,
): ApiRequest<HttpRequest, S> =>
  pipe(
    readEnv<S>(),
    map(f),
    chain(reader => pipe(readEnv<S>(), map(reader))),
  )

export const buildRequestC = <S extends BasicState>(
  f: (a: { state: S; env: RequestEnv }) => HttpRequestConfig,
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

export const buildRequestE = <S extends BasicState>(
  f: (a: { state: S; env: RequestEnv }) => ApiRequest<R.Reader<{ session: ICloudSession }, HttpRequest>, S>,
): ApiRequest<HttpRequest, S> =>
  pipe(
    readEnv<S>(),
    chain(f),
    chain(reader => pipe(readEnv<S>(), map(s => reader(s.state)))),
  )

export const fetch = <S extends BasicState>(
  req: ApiRequest<HttpRequest, S>,
) => {
  return pipe(
    readEnv<S>(),
    SRTE.bindW('req', () => req),
    chain(({ req, env: { fetch } }) => fromTaskEither(fetch(req))),
  )
}

export const handleResponse = <A, S extends BasicState>(
  f: (ma: ApiRequest<{ httpResponse: HttpResponse }, S>) => ApiRequest<A, S>,
) =>
  (
    req: ApiRequest<HttpRequest, S>,
  ): ApiRequest<A, S> =>
    pipe(
      readEnv<S>(),
      SRTE.bind('req', () => req),
      chain(({ env: { fetch }, req }) =>
        fromTaskEither(pipe(
          logg(`${req.url.replace(/\?.+/, '')} ${JSON.stringify(req.data)}`, apiLogger.debug),
          () => fetch(req),
          TE.map(httpResponse => ({ httpResponse })),
        ))
      ),
      f,
    )

export const filterHttpResponse = <R extends { httpResponse: HttpResponse }, S extends BasicState>(
  f: (r: R) => E.Either<Error, R>,
) => (ma: ApiRequest<R, S>) => pipe(ma, chain(a => fromEither(f(a))))

export const handleInvalidSession = <S extends BasicState>(): Filter<S> =>
  filterHttpResponse(
    (r) =>
      r.httpResponse.status == 421
        ? E.left(InvalidGlobalSessionError.create(r.httpResponse))
        : E.of(r),
  )

export const handleBadRequest = <S extends BasicState>(): Filter<S> =>
  filterHttpResponse(
    (r) =>
      r.httpResponse.status == 400
        ? E.left(BadRequestError.create(r.httpResponse))
        : E.of(r),
  )

const handleStatus = <R extends { httpResponse: HttpResponse }, S extends BasicState>(validStatuses: number[]) =>
  filterHttpResponse<R, S>(
    (r) =>
      validStatuses.includes(r.httpResponse.status)
        ? E.of(r)
        : E.left(err(`invalid status ${r.httpResponse.status} ${JSON.stringify(r.httpResponse.data)}`)),
  )

export const validateHttpResponse = <R extends { httpResponse: HttpResponse }, S extends BasicState>(
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

export const decodeJson = <T extends { httpResponse: HttpResponse }, R, S extends BasicState>(
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

export const decodeJsonEither = <T extends { httpResponse: HttpResponse }, R, S extends BasicState>(
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
  <S extends BasicState>(
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

export const applyCookies = <T extends { httpResponse: HttpResponse }, S extends BasicState>() =>
  applyToSession<T>(({ httpResponse }) =>
    flow(
      applyCookiesToSession(httpResponse),
    )
  )

export const basicJsonResponse = <T extends { httpResponse: HttpResponse }, S extends BasicState, R>(
  jsonDecoder: t.Decode<unknown, R>,
) => {
  return flow(
    validateHttpResponse<T, S>(),
    decodeJson(jsonDecoder),
    applyCookies(),
    map(_ => _.decoded),
  )
}

export const basicDriveJsonRequest = <S extends AuthorizedState, A>(
  f: (a: { state: S; env: RequestEnv }) => HttpRequestConfig,
  jsonDecoder: t.Decode<unknown, A>,
) => {
  return pipe(
    buildRequestC<S>(f),
    handleResponse(basicJsonResponse(jsonDecoder)),
  )
}

export const orElse = <R, S extends BasicState>(
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
