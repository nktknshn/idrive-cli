import * as E from 'fp-ts/lib/Either'
import { constant, flow, hole, pipe } from 'fp-ts/lib/function'
import * as TE from 'fp-ts/lib/TaskEither'
import * as t from 'io-ts'
import {
  BadRequestError,
  err,
  InvalidGlobalSessionError,
  InvalidJsonInResponse,
  MissingResponseBody,
} from '../../../lib/errors'
import { HttpResponse } from '../../../lib/http/fetch-client'
import { tryJsonFromResponse } from '../../../lib/http/json'
import { AuthorizedState } from '../../authorization/authorize'
import { ICloudSession } from '../../session/session'
import { applyCookiesToSession } from '../../session/session-http'

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

const errorMessage = (err: t.ValidationError) => {
  const path = err.context.map((e) => `${e.key}`).join('/')

  return `invalid value ${err.value} in ${path}`
}

export const reporter = (validation: t.Validation<any>): string => {
  return pipe(
    validation,
    E.fold((errors) => errors.map(errorMessage).join('\n'), () => 'ok'),
  )
}
// PathReporter.report(E.left(errors))

export const decodeJson = <R>(decode: (u: unknown) => t.Validation<R>) =>
  (te: TE.TaskEither<Error, { httpResponse: HttpResponse }>) =>
    pipe(
      te,
      TE.bindW('json', (r: { httpResponse: HttpResponse }) => tryJsonFromResponse(r.httpResponse)),
      TE.bind('decoded', ({ json }) =>
        pipe(
          decode(json),
          E.mapLeft(errors => err(`Error decoding json: ${reporter(E.left(errors))}`)),
          TE.fromEither,
        )),
    )

export const decodeJsonEither = <R>(
  decode: (u: unknown) => t.Validation<R>,
): (
  te: TE.TaskEither<Error, { httpResponse: HttpResponse }>,
) => TE.TaskEither<
  Error,
  {
    readonly httpResponse: HttpResponse
    readonly json: E.Either<MissingResponseBody, unknown>
    readonly decoded: E.Either<Error, R>
  }
> =>
  (te: TE.TaskEither<Error, { httpResponse: HttpResponse }>) =>
    pipe(
      te,
      TE.bindW('json', (r: { httpResponse: HttpResponse }) =>
        pipe(
          tryJsonFromResponse(r.httpResponse),
          TE.fold(
            e => TE.of(E.left<MissingResponseBody, unknown>(e)),
            json => TE.of(E.right<MissingResponseBody, unknown>(json)),
          ),
        )),
      TE.bindW('decoded', ({ json }) =>
        pipe(
          json,
          E.chain(json =>
            pipe(
              decode(json),
              E.mapLeft(errors => err(`Error decoding json: ${reporter(E.left(errors))}`)),
            )
          ),
          TE.of,
        )),
    )

export function applyToSession<R>(
  f: (a: { decoded: R; httpResponse: HttpResponse }) => ICloudSession,
): (
  te: TE.TaskEither<Error, { decoded: R; httpResponse: HttpResponse }>,
) => TE.TaskEither<Error, ResponseWithSession<R>> {
  return (
    te: TE.TaskEither<Error, { decoded: R; httpResponse: HttpResponse }>,
  ): TE.TaskEither<Error, ResponseWithSession<R>> => {
    return pipe(
      te,
      TE.map(({ decoded, httpResponse }) => ({
        session: f({ decoded, httpResponse }),
        response: {
          httpResponse,
          body: decoded,
        },
      })),
    )
  }
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

export function returnEither<T extends { httpResponse: HttpResponse; session: ICloudSession }, R>(
  ff: (a: T) => E.Either<Error, R>,
) {
  return (f: (session: ICloudSession) => TE.TaskEither<Error, T>) =>
    (session: ICloudSession): TE.TaskEither<Error, ResponseWithSession<R>> =>
      pipe(
        f(session),
        TE.chain((a) =>
          pipe(
            ff(a),
            E.map(body => ({
              session: a.session,
              response: {
                httpResponse: a.httpResponse,
                body,
              },
            })),
            TE.fromEither,
          )
        ),
      )
}

export const returnEmpty = returnS(constant({}))
export const returnDecodedJson = <
  R,
>() => returnS<{ httpResponse: HttpResponse; session: ICloudSession; readonly decoded: R }, R>(_ => _.decoded)

export const withResponse = (httpResponse: HttpResponse) =>
  pipe(
    TE.Do,
    TE.bind('httpResponse', () => TE.of<Error, HttpResponse>(httpResponse)),
  )

export const expectJson = <T>(
  decode: t.Decode<unknown, T>,
  ap: (
    session: ICloudSession,
  ) => (a: { decoded: T; httpResponse: HttpResponse }) => ICloudSession = (
    session: ICloudSession,
  ) => (({ httpResponse }) => applyCookiesToSession(httpResponse)(session)),
) =>
  (session: ICloudSession) =>
    TE.chain<Error, HttpResponse, ResponseWithSession<T>>(
      flow(
        withResponse,
        filterStatus(),
        decodeJson(decode),
        applyToSession(ap(session)),
      ),
    )

export const withResponse2 = <R extends { httpResponse: HttpResponse }>(
  f: (te: TE.TaskEither<Error, { httpResponse: HttpResponse }>) => (session: ICloudSession) => TE.TaskEither<Error, R>,
) =>
  (te: TE.TaskEither<Error, HttpResponse>): (session: ICloudSession) => TE.TaskEither<Error, R> =>
    pipe(
      TE.Do,
      TE.bind('httpResponse', () => te),
      f,
    )
