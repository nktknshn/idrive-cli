import { sequenceS } from 'fp-ts/lib/Apply'
import * as E from 'fp-ts/lib/Either'
import { constant, flow, pipe } from 'fp-ts/lib/function'
import * as R from 'fp-ts/lib/Reader'
import * as RTE from 'fp-ts/lib/ReaderTaskEither'
import * as SRTE from 'fp-ts/lib/StateReaderTaskEither'
import * as TE from 'fp-ts/lib/TaskEither'
import * as t from 'io-ts'
import {
  BadRequestError,
  err,
  InvalidGlobalSessionError,
  InvalidJsonInResponse,
  InvalidResponseStatusError,
  MissingResponseBody,
} from '../../util/errors'
import { FetchClientEither, HttpRequest, HttpResponse } from '../../util/http/fetch-client'
import { tryJsonFromResponse } from '../../util/http/json'
import { apiLogger, logg } from '../../util/logging'
import { AccountData } from '../authorization/types'
import { ICloudSession } from '../session/session'
import { apiHttpRequest, applyCookiesToSession, HttpRequestConfig } from '../session/session-http'

export type BasicState = {
  session: ICloudSession
}

export type AuthorizedState = BasicState & {
  accountData: AccountData
}

export type AuthorizedRequest<A, S = AuthorizedState, R = RequestEnv> = ApiRequest<A, S, R>

export type RequestEnv = {
  fetchClient: FetchClientEither
}

/** API context */
export type ApiRequest<A, S, R = RequestEnv> = SRTE.StateReaderTaskEither<S, R, Error, A>

interface ValidHttpResponseBrand {
  readonly ValidHttpResponse: unique symbol
}

type ValidHttpResponse<R extends { httpResponse: HttpResponse }> = t.Branded<R, ValidHttpResponseBrand>

type Filter<S extends BasicState, R extends RequestEnv> = (
  ma: ApiRequest<{ httpResponse: HttpResponse }, S, R>,
) => ApiRequest<{ httpResponse: HttpResponse }, S, R>

export type ResponseWithSession<R> = {
  session: ICloudSession
  response: {
    httpResponse: HttpResponse
    body: R
  }
}

export type ResponseHandler<R, E1 = Error> = (
  session: ICloudSession,
) => (
  ma: TE.TaskEither<E1, HttpResponse>,
) => TE.TaskEither<MissingResponseBody | InvalidJsonInResponse | Error | E1, ResponseWithSession<R>>

export const { chain, fromEither, fromOption, fromTaskEither, get, left, map, of, filterOrElse } = SRTE

// export const Do = <S extends BasicState>() => of<{}, S>({})

const ado = sequenceS(SRTE.Apply)

export const readEnv = <S extends BasicState, R extends RequestEnv = RequestEnv>() =>
  ado({
    state: SRTE.get<S, R, Error>(),
    env: SRTE.ask<S, R, Error>(),
  })

const putSession = <S extends { session: ICloudSession }, R extends RequestEnv>(
  session: ICloudSession,
): ApiRequest<void, S, R> =>
  pipe(
    readEnv<S, R>(),
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

export const buildRequestC = <S extends BasicState, R extends RequestEnv = RequestEnv>(
  f: (a: { state: S; env: R }) => HttpRequestConfig,
): ApiRequest<HttpRequest, S, R> =>
  pipe(
    readEnv<S, R>(),
    map(env =>
      pipe(
        f(env),
        config => apiHttpRequest(config.method, config.url, config.options)(env.state),
      )
    ),
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
    chain(({ req, env: { fetchClient: fetch } }) => fromTaskEither(fetch(req))),
  )
}

export const handleResponse = <A, S extends BasicState, R extends RequestEnv>(
  f: (
    ma: ApiRequest<{ httpResponse: HttpResponse }, S, R>,
  ) => ApiRequest<A, S, R>,
) =>
  (
    req: ApiRequest<HttpRequest, S, R>,
  ): ApiRequest<A, S, R> =>
    pipe(
      readEnv<S, R>(),
      SRTE.bind('req', () => req),
      SRTE.chainW(({ env: { fetchClient: fetch }, req }) =>
        SRTE.fromTaskEither(pipe(
          logg(`${req.url.replace(/\?.+/, '')} ${JSON.stringify(req.data)}`, apiLogger.debug),
          () => fetch(req),
          TE.map(httpResponse => ({ httpResponse })),
        ))
      ),
      m => f(m),
    )

export const filterHttpResponse = <
  Resp extends { httpResponse: HttpResponse },
  S extends BasicState,
  R extends RequestEnv,
>(
  f: (r: Resp) => E.Either<Error, Resp>,
) => (ma: ApiRequest<Resp, S, R>) => pipe(ma, chain(a => fromEither(f(a))))

export const handleInvalidSession = <S extends BasicState, R extends RequestEnv>(): Filter<S, R> =>
  filterHttpResponse(
    (r) =>
      r.httpResponse.status == 421
        ? E.left(InvalidGlobalSessionError.create(r.httpResponse))
        : E.of(r),
  )

export const handleBadRequest = <S extends BasicState, R extends RequestEnv>(): Filter<S, R> =>
  filterHttpResponse(
    (r) =>
      r.httpResponse.status == 400
        ? E.left(BadRequestError.create(r.httpResponse))
        : E.of(r),
  )

const handleStatus = <Resp extends { httpResponse: HttpResponse }, S extends BasicState, R extends RequestEnv>(
  validStatuses: number[],
) =>
  filterHttpResponse<Resp, S, R>(
    (r) =>
      validStatuses.includes(r.httpResponse.status)
        ? E.of(r)
        : E.left(
          InvalidResponseStatusError.create(
            r.httpResponse,
            `invalid status ${r.httpResponse.status} ${JSON.stringify(r.httpResponse.data)}`,
          ),
        ),
  )

export const validateHttpResponse = <
  Resp extends { httpResponse: HttpResponse },
>(
  { validStatuses }: { validStatuses: number[] } = { validStatuses: [200, 204] },
) =>
  <S extends BasicState, R extends RequestEnv>(ma: ApiRequest<Resp, S, R>): ApiRequest<ValidHttpResponse<Resp>, S, R> =>
    pipe(
      ma,
      handleInvalidSession<S, R>(),
      handleBadRequest(),
      handleStatus(validStatuses),
      map(_ => _ as ValidHttpResponse<Resp>),
    )

export const decodeJson = <T extends { httpResponse: HttpResponse }, Resp>(
  decode: (u: unknown) => t.Validation<Resp>,
) =>
  <S extends BasicState, R extends RequestEnv>(
    ma: ApiRequest<ValidHttpResponse<T>, S, R>,
  ): ApiRequest<
    ValidHttpResponse<T & { readonly json: unknown; readonly httpResponse: HttpResponse; readonly decoded: Resp }>,
    S,
    R
  > =>
    pipe(
      ma,
      SRTE.bindW('json', (r: { httpResponse: HttpResponse }) => fromTaskEither(tryJsonFromResponse(r.httpResponse))),
      SRTE.bind('decoded', ({ json }) =>
        fromEither(pipe(
          decode(json),
          E.mapLeft(errors => err(`Error decoding json: ${reporter(E.left(errors))}`)),
        ))),
      map(_ =>
        _ as ValidHttpResponse<
          T & { readonly json: unknown; readonly httpResponse: HttpResponse; readonly decoded: Resp }
        >
      ),
    )

export const reporter = (validation: t.Validation<any>): string => {
  return pipe(
    validation,
    E.fold((errors) => errors.map(errorMessage).join('\n'), () => 'ok'),
  )
}

const errorMessage = (err: t.ValidationError) => {
  const path = err.context.map((e) => `${e.key}`).join('/')

  return `invalid value ${err.value} in ${path}`
}

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
              E.mapLeft(errors => err(`Error decoding json: ${reporter(E.left(errors))}`)),
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
  <S extends BasicState, R extends RequestEnv>(
    ma: ApiRequest<ValidHttpResponse<T>, S, R>,
  ) =>
    pipe(
      ma,
      chain(r =>
        pipe(
          readEnv<S, R>(),
          chain(({ state: { session } }) => putSession(f(r)(session))),
          map(constant(r)),
        )
      ),
    )

export const applyCookies = <T extends { httpResponse: HttpResponse }>() =>
  applyToSession<T>(({ httpResponse }) =>
    flow(
      applyCookiesToSession(httpResponse),
    )
  )

export const basicJsonResponse = <
  T extends { httpResponse: HttpResponse },
  A,
>(
  jsonDecoder: t.Decode<unknown, A>,
) => {
  return <S extends BasicState, R extends RequestEnv>(
    ma: ApiRequest<T, S, R>,
  ): ApiRequest<A, S, R> =>
    pipe(
      ma,
      validateHttpResponse<T>(),
      decodeJson(jsonDecoder),
      applyCookies(),
      map(_ => _.decoded),
    )
}

export const basicDriveJsonRequest = <S extends AuthorizedState, A, R extends RequestEnv>(
  f: (a: { state: S; env: R }) => HttpRequestConfig,
  jsonDecoder: t.Decode<unknown, A>,
): ApiRequest<A, S, R> => {
  const p = basicJsonResponse(jsonDecoder)
  return pipe(
    buildRequestC<S, R>(f),
    handleResponse<A, S, R>(p),
  )
}

export const orElse = <R, S extends BasicState>(
  onError: (e: Error) => ApiRequest<R, S>,
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

export const filterStatus = (status = 200) => filterStatuses([status])

export const filterStatuses = <B extends { httpResponse: HttpResponse }>(
  statuses = [200],
) =>
  (mb: TE.TaskEither<Error, B>): TE.TaskEither<Error, B> =>
    pipe(
      mb,
      TE.filterOrElseW(
        (r: { httpResponse: HttpResponse }) => r.httpResponse.status != 421,
        r => InvalidGlobalSessionError.create(r.httpResponse),
      ),
      TE.filterOrElseW(
        (r: { httpResponse: HttpResponse }) => r.httpResponse.status != 400,
        r => BadRequestError.create(r.httpResponse),
      ),
      TE.filterOrElseW(
        r => statuses.includes(r.httpResponse.status),
        r => err(`invalid status ${r.httpResponse.status}`),
      ),
    )

export const filterStatusesE = <B extends { httpResponse: HttpResponse }>(
  statuses = [200],
) =>
  (mb: B): E.Either<Error, B> =>
    pipe(
      E.of(mb),
      E.filterOrElseW(
        (r: { httpResponse: HttpResponse }) => r.httpResponse.status != 421,
        r => InvalidGlobalSessionError.create(r.httpResponse),
      ),
      E.filterOrElseW(
        (r: { httpResponse: HttpResponse }) => r.httpResponse.status != 400,
        r => BadRequestError.create(r.httpResponse),
      ),
      E.filterOrElseW(
        r => statuses.includes(r.httpResponse.status),
        r => err(`invalid status ${r.httpResponse.status}`),
      ),
    )

export const withResponse = (httpResponse: HttpResponse) =>
  pipe(
    TE.Do,
    TE.bind('httpResponse', () => TE.of<Error, HttpResponse>(httpResponse)),
  )

export const returnDecodedJson = <
  R,
>() => returnS<{ httpResponse: HttpResponse; session: ICloudSession; readonly decoded: R }, R>(_ => _.decoded)

export const applyCookiesFromResponse = <T extends { httpResponse: HttpResponse }>() =>
  applyToSession2<T>(({ httpResponse }) => applyCookiesToSession(httpResponse))

export function returnS<T extends { httpResponse: HttpResponse; session: ICloudSession }, R>(
  ff: (a: T) => R,
) {
  return (f: (session: ICloudSession) => TE.TaskEither<Error, T>) =>
    (session: ICloudSession): TE.TaskEither<Error, ResponseWithSession<R>> =>
      pipe(
        f(session),
        TE.map((a) => ({
          session: a.session,
          response: {
            httpResponse: a.httpResponse,
            body: ff(a),
          },
        })),
      )
}

export function applyToSession2<T extends { httpResponse: HttpResponse }>(
  f: (a: T) => (session: ICloudSession) => ICloudSession,
): (te: TE.TaskEither<Error, T>) => (session: ICloudSession) => TE.TaskEither<Error, T & { session: ICloudSession }> {
  return (te: TE.TaskEither<Error, T>) => {
    return (session: ICloudSession) =>
      pipe(
        te,
        // TE.bind('session', (a) => f(a)(session)),
        TE.map(a => ({
          ...a,
          session: f(a)(session),
        })),
      )
  }
}
