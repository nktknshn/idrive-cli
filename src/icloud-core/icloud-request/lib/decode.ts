import * as E from 'fp-ts/Either'
import { pipe } from 'fp-ts/lib/function'
import * as SRTE from 'fp-ts/lib/StateReaderTaskEither'
import * as TE from 'fp-ts/TaskEither'
import * as t from 'io-ts'
import { err, MissingResponseBody } from '../../../util/errors'
import { HttpResponse } from '../../../util/http/fetch-client'
import { tryJsonFromResponse } from '../../../util/http/json'
import { fromEither, fromTaskEither, map, of } from './request'
import { ApiRequest, BaseState, RequestDeps, ValidHttpResponse } from './types'

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

export const reporter = (validation: t.Validation<unknown>): string => {
  return pipe(
    validation,
    E.fold((errors) => errors.map(errorMessage).join('\n'), () => 'ok'),
  )
}

const errorMessage = (err: t.ValidationError) => {
  const path = err.context.map((e) => `${e.key}`).join('/')

  return `invalid value ${err.value} in ${path}`
}
