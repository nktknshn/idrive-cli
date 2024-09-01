import { pipe } from 'fp-ts/lib/function'
import * as t from 'io-ts'
import { HttpRequest, HttpResponse } from '../../../util/http/fetch-client'
import { apHttpRequest, HttpRequestConfig } from '../../session/session-http'
import { decodeJson } from './decode'
import { handleResponse, validateHttpResponse } from './handle'
import { map, readStateAndDeps } from './request'
import { applyCookies } from './session'
import { ApiRequest, BaseState, RequestDeps } from './types'

export const buildRequest = <S extends BaseState, R extends RequestDeps = RequestDeps>(
  f: (a: { state: S; deps: R }) => HttpRequestConfig,
): ApiRequest<HttpRequest, S, R> =>
  pipe(
    readStateAndDeps<S, R>(),
    map(env =>
      pipe(
        f(env),
        config => apHttpRequest(config.method, config.url, config.options)(env.state),
      )
    ),
  )

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
