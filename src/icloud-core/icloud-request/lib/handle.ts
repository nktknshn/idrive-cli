import * as E from 'fp-ts/Either'
import { pipe } from 'fp-ts/lib/function'
import * as SRTE from 'fp-ts/lib/StateReaderTaskEither'
import * as TE from 'fp-ts/TaskEither'
import { BadRequestError, InvalidGlobalSessionError, InvalidResponseStatusError } from '../../../util/errors'
import { HttpRequest, HttpResponse } from '../../../util/http/fetch-client'
import { chain, fromEither, map, readStateAndDeps } from './request'
import { ApiRequest, BaseState, Filter, RequestDeps, ValidHttpResponse } from './types'

export const handleResponse = <A, S extends BaseState, R extends RequestDeps>(
  f: (ma: ApiRequest<{ httpResponse: HttpResponse }, S, R>) => ApiRequest<A, S, R>,
) =>
  (
    req: ApiRequest<HttpRequest, S, R>,
  ): ApiRequest<A, S, R> =>
    pipe(
      readStateAndDeps<S, R>(),
      SRTE.bind('req', () => req),
      SRTE.chainW(({ deps: { fetchClient: fetch }, req }) =>
        SRTE.fromTaskEither(pipe(
          fetch(req),
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
) =>
  (ma: ApiRequest<Resp, S, R>): SRTE.StateReaderTaskEither<S, R, Error, Resp> => pipe(ma, chain(a => fromEither(f(a))))

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
