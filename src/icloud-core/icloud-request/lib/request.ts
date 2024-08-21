import { sequenceS } from 'fp-ts/lib/Apply'
import * as E from 'fp-ts/lib/Either'
import { constant, flow, pipe } from 'fp-ts/lib/function'
import * as RTE from 'fp-ts/lib/ReaderTaskEither'
import * as SRTE from 'fp-ts/lib/StateReaderTaskEither'
import * as TE from 'fp-ts/lib/TaskEither'
import * as t from 'io-ts'
import { type AccountData } from '../../../icloud-authorization/types'
import {
  BadRequestError,
  err,
  InvalidGlobalSessionError,
  InvalidJsonInResponse,
  InvalidResponseStatusError,
  MissingResponseBody,
} from '../../../util/errors'
import { FetchClientEither, HttpRequest, HttpResponse } from '../../../util/http/fetch-client'
import { tryJsonFromResponse } from '../../../util/http/json'
import { apiLogger, logg } from '../../../util/logging'
import { apiHttpRequest, applyCookiesToSession, HttpRequestConfig } from '../../session/session-http'
import { ICloudSession } from '../../session/session-type'

/*
Module for building and executing low level Api Request and decoding server response
*/

/** Bases state has only sesssion */
export type BaseState = {
  session: ICloudSession
}

/** accountData is added after successful athorization */
export type AuthorizedState = BaseState & {
  accountData: AccountData
}

/** fetchClient is the base dependency of this module */
export type RequestDeps = {
  fetchClient: FetchClientEither
}

/** API context */
export type ApiRequest<A, S, R = RequestDeps> = SRTE.StateReaderTaskEither<S, R, Error, A>

interface ValidHttpResponseBrand {
  readonly ValidHttpResponse: unique symbol
}

type ValidHttpResponse<R extends { httpResponse: HttpResponse }> = t.Branded<R, ValidHttpResponseBrand>

type Filter<S extends BaseState, R extends RequestDeps> = (
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

export const readEnv = <S extends BaseState, R extends RequestDeps = RequestDeps>() =>
  ado({
    state: SRTE.get<S, R, Error>(),
    deps: SRTE.ask<S, R, Error>(),
  })

const putSession = <S extends { session: ICloudSession }, R extends RequestDeps>(
  session: ICloudSession,
): ApiRequest<void, S, R> =>
  pipe(
    readEnv<S, R>(),
    chain(({ state }) => SRTE.put({ ...state, session })),
  )

export const buildRequest = <S extends BaseState, R extends RequestDeps = RequestDeps>(
  f: (a: { state: S; deps: R }) => HttpRequestConfig,
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

export const handleResponse = <A, S extends BaseState, R extends RequestDeps>(
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
      SRTE.chainW(({ deps: { fetchClient: fetch }, req }) =>
        SRTE.fromTaskEither(pipe(
          logg(
            `${req.url.replace(/\?.+/, '')} ${JSON.stringify(req.data)}`,
            a => apiLogger.debug(a),
          ),
          () => fetch(req),
          TE.map(httpResponse => ({ httpResponse })),
        ))
      ),
      m => f(m),
    )

export const filterHttpResponse = <
  Resp extends { httpResponse: HttpResponse },
  S extends BaseState,
  R extends RequestDeps,
>(
  f: (r: Resp) => E.Either<Error, Resp>,
) => (ma: ApiRequest<Resp, S, R>) => pipe(ma, chain(a => fromEither(f(a))))

export const handleInvalidSession = <S extends BaseState, R extends RequestDeps>(): Filter<S, R> =>
  filterHttpResponse(
    (r) =>
      r.httpResponse.status == 421
        ? E.left(InvalidGlobalSessionError.create(r.httpResponse))
        : E.of(r),
  )

export const handleBadRequest = <S extends BaseState, R extends RequestDeps>(): Filter<S, R> =>
  filterHttpResponse(
    (r) =>
      r.httpResponse.status == 400
        ? E.left(BadRequestError.create(r.httpResponse))
        : E.of(r),
  )

const handleStatus = <Resp extends { httpResponse: HttpResponse }, S extends BaseState, R extends RequestDeps>(
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
  <S extends BaseState, R extends RequestDeps>(ma: ApiRequest<Resp, S, R>): ApiRequest<ValidHttpResponse<Resp>, S, R> =>
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
  <S extends BaseState, R extends RequestDeps>(
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

export const decodeJsonEither = <T extends { httpResponse: HttpResponse }, R, S extends BaseState>(
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
  <S extends BaseState, R extends RequestDeps>(
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
  return <S extends BaseState, R extends RequestDeps>(
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

export const basicJsonRequest = <S extends BaseState, A, R extends RequestDeps>(
  f: (a: { state: S; deps: R }) => HttpRequestConfig,
  jsonDecoder: t.Decode<unknown, A>,
): ApiRequest<A, S, R> => {
  const p = basicJsonResponse(jsonDecoder)
  return pipe(
    buildRequest<S, R>(f),
    handleResponse<A, S, R>(p),
  )
}

export const orElse = <R, S extends BaseState>(
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
