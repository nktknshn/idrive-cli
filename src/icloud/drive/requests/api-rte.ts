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
import { BadRequestError, err, InvalidGlobalSessionError, MissingResponseBody } from '../../../lib/errors'
import { FetchClientEither, HttpRequest, HttpResponse } from '../../../lib/http/fetch-client'
import { tryJsonFromResponse } from '../../../lib/http/json'
import { ICloudSessionValidated } from '../../authorization/authorize'
import { AccountLoginResponseBody } from '../../authorization/types'
import { ICloudSession } from '../../session/session'
import { apiHttpRequest, applyCookiesToSession, HttpRequestConfig } from '../../session/session-http'
import * as H from './http'

export const Do = RTE.of<Env, Error, {}>({})

export type ReaderRequest<T> = R.Reader<
  { client: FetchClientEither; session: ICloudSessionValidated },
  TE.TaskEither<Error, H.ResponseWithSession<T>>
>

export type Env = {
  fetch: FetchClientEither
  getCode: () => TE.TaskEither<Error, string>
  session: ICloudSession
  accountData: AccountLoginResponseBody
}

export type State = { session: ICloudSession }

export type ApiSessionRequest<A> = RTE.ReaderTaskEither<Env, Error, A>

const ado = sequenceS(RTE.ApplyPar)

export const readEnv = RTE.ask<Env, Error>()
export const asks: <A>(f: (r: Env) => ApiSessionRequest<A>) => ApiSessionRequest<A> = RTE.asks as any

export const fromTaskEither = <A>(te: TE.TaskEither<Error, A>): ApiSessionRequest<A> => RTE.fromTaskEither(te)

export const fromEither = <A>(te: E.Either<Error, A>): ApiSessionRequest<A> => RTE.fromEither(te)

export const fromOption = <A>(
  e: Lazy<Error>,
) => (opt: O.Option<A>): ApiSessionRequest<A> => RTE.fromOption(e)(opt)

export const chain = <A, B>(
  f: (a: A) => ApiSessionRequest<B>,
): (ma: ApiSessionRequest<A>) => ApiSessionRequest<B> => RTE.chain(f)

export const of = <A>(v: A): ApiSessionRequest<A> => RTE.of(v)

export const left = <A>(e: Error): ApiSessionRequest<A> => RTE.left(e)

export const map = RTE.map

export const buildRequest = (
  f: (a: Env) => R.Reader<{ session: ICloudSession }, HttpRequest>,
): RTE.ReaderTaskEither<Env, Error, HttpRequest> =>
  pipe(
    readEnv,
    map(f),
    chain(reader => pipe(readEnv, map(reader))),
  )

export const buildRequestC = (
  f: (a: Env) => HttpRequestConfig,
): ApiSessionRequest<HttpRequest> =>
  pipe(
    readEnv,
    map(f),
    chain(config =>
      pipe(
        readEnv,
        map(apiHttpRequest(config.method, config.url, config.options)),
      )
    ),
  )

export const buildRequestE = (
  f: (a: Env) => ApiSessionRequest<R.Reader<{ session: ICloudSession }, HttpRequest>>,
): RTE.ReaderTaskEither<Env, Error, HttpRequest> =>
  pipe(
    readEnv,
    chain(f),
    chain(reader => pipe(readEnv, map(reader))),
  )

export const fetch = (
  req: ApiSessionRequest<HttpRequest>,
) => {
  return pipe(
    readEnv,
    RTE.bindW('req', () => req),
    chain(({ req, fetch }) => fromTaskEither(fetch(req))),
  )
}

export const handleResponse = <R>(
  f: (ma: ApiSessionRequest<{ httpResponse: HttpResponse }>) => ApiSessionRequest<R>,
) =>
  (
    req: ApiSessionRequest<HttpRequest>,
  ) =>
    pipe(
      readEnv,
      RTE.bind('req', () => req),
      chain(({ fetch, req }) =>
        fromTaskEither(pipe(
          fetch(req),
          TE.map(httpResponse => ({ httpResponse })),
        ))
      ),
      f,
    )

type Filter = (
  ma: ApiSessionRequest<{ httpResponse: HttpResponse }>,
) => RTE.ReaderTaskEither<Env, Error, { httpResponse: HttpResponse }>

export const filterHttpResponse = <R extends { httpResponse: HttpResponse }>(
  f: (r: R) => E.Either<Error, R>,
) => (ma: ApiSessionRequest<R>) => pipe(ma, chain(RTE.fromEitherK(f)))

export const handleInvalidSession = (): Filter =>
  filterHttpResponse(
    (r) =>
      r.httpResponse.status == 421
        ? E.left(InvalidGlobalSessionError.create(r.httpResponse))
        : E.of(r),
  )
export const handleBadRequest = (): Filter =>
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

export const validateHttpResponse = <R extends { httpResponse: HttpResponse }>(
  { statuses }: { statuses: number[] } = { statuses: [200, 204] },
) =>
  (ma: ApiSessionRequest<R>): ApiSessionRequest<ValidHttpResponse<R>> =>
    pipe(
      ma,
      handleInvalidSession(),
      handleBadRequest(),
      filterHttpResponse(
        (r) =>
          statuses.includes(r.httpResponse.status)
            ? E.of(r)
            : E.left(err(`invalid status ${r.httpResponse.status} ${JSON.stringify(r.httpResponse.data)}`)),
      ),
      map(_ => _ as ValidHttpResponse<R>),
    )

export const decodeJson = <T extends { httpResponse: HttpResponse }, R>(
  decode: (u: unknown) => t.Validation<R>,
) =>
  (
    ma: ApiSessionRequest<ValidHttpResponse<T>>,
  ): ApiSessionRequest<
    ValidHttpResponse<T & { readonly json: unknown; readonly httpResponse: HttpResponse; readonly decoded: R }>
  > =>
    pipe(
      ma,
      RTE.bindW('json', (r: { httpResponse: HttpResponse }) => fromTaskEither(tryJsonFromResponse(r.httpResponse))),
      RTE.bind('decoded', ({ json }) =>
        fromEither(pipe(
          decode(json),
          E.mapLeft(errors => err(`Error decoding json: ${H.reporter(E.left(errors))}`)),
        ))),
      map(_ =>
        _ as ValidHttpResponse<T & { readonly json: unknown; readonly httpResponse: HttpResponse; readonly decoded: R }>
      ),
    )

export const decodeJsonEither = <T extends { httpResponse: HttpResponse }, R>(
  decode: (u: unknown) => t.Validation<R>,
) =>
  (
    ma: ApiSessionRequest<ValidHttpResponse<T>>,
  ): ApiSessionRequest<
    ValidHttpResponse<
      T & {
        readonly json: unknown
        readonly httpResponse: E.Either<MissingResponseBody, unknown>
        readonly decoded: E.Either<Error, R>
      }
    >
  > =>
    pipe(
      ma,
      RTE.bindW(
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
      RTE.bindW('decoded', ({ json }) =>
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
  (
    ma: ApiSessionRequest<ValidHttpResponse<T>>,
  ): ApiSessionRequest<
    readonly [
      ValidHttpResponse<T>,
      { readonly accountData: AccountLoginResponseBody; readonly session: ICloudSession },
    ]
  > =>
    pipe(
      ma,
      chain(r =>
        pipe(
          readEnv,
          map(({ accountData, session }) => [r, { accountData, session: f(r)(session) }] as const),
          // map(constant(r)),
        )
      ),
    )

export const applyCookies = <T extends { httpResponse: HttpResponse }>() =>
  applyToSession<T>(({ httpResponse }) => applyCookiesToSession(httpResponse))

export const basicJsonResponse = <T extends { httpResponse: HttpResponse }, R>(
  decode: t.Decode<unknown, R>,
): (
  ma: ApiSessionRequest<T>,
) => RTE.ReaderTaskEither<
  Env,
  Error,
  [R, { readonly accountData: AccountLoginResponseBody; readonly session: ICloudSession }]
> => {
  return flow(
    validateHttpResponse<T>(),
    decodeJson(decode),
    applyCookies(),
    map(([response, session]) => [response.decoded, session]),
  )
}

export const basicDriveJsonRequest = <R>(
  f: (a: Env) => HttpRequestConfig,
  decode: t.Decode<unknown, R>,
) => {
  return pipe(
    buildRequestC(f),
    handleResponse(basicJsonResponse(decode)),
  )
}

export const orElse = <R>(
  onError: (e: Error) => ApiSessionRequest<R>,
) =>
  (
    ma: ApiSessionRequest<R>,
  ): ApiSessionRequest<R> => {
    return pipe(
      ma,
      RTE.orElse(e => onError(e)),
    )
  }

export type DriveApiRequest<R> = ApiSessionRequest<[R, ICloudSessionValidated]>

export type AuthorizationState = {
  session: ICloudSession
}

export type AuthorizationApiRequest<R> = ApiSessionRequest<R>
