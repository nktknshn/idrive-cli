import * as E from 'fp-ts/lib/Either'
import { flow, pipe } from 'fp-ts/lib/function'
import * as TE from 'fp-ts/lib/TaskEither'
import * as t from 'io-ts'
import { PathReporter } from 'io-ts/PathReporter'
import { err, InvalidGlobalSessionResponse } from '../../../lib/errors'
import { HttpResponse } from '../../../lib/fetch-client'
import { tryJsonFromResponse } from '../../../lib/json'
import { ResponseWithSession } from '../../../lib/response-reducer'
import { ICloudSession } from '../../session/session'

// const applyHttpResponseToSessionHierarchy = expectJson((
//   json: unknown,
// ): json is { items: DriveItemDetails[] } => scheme.is(json))
export const filterStatus = (status = 200) =>
  flow(
    TE.filterOrElseW(
      (r: { httpResponse: HttpResponse }) => r.httpResponse.status != 421,
      r => InvalidGlobalSessionResponse.create(r.httpResponse),
    ),
    TE.filterOrElseW(
      r => r.httpResponse.status == status,
      r => err(`invalid status ${r.httpResponse.status}`),
    ),
  )

const errorMessage = (err: t.ValidationError) => {
  const path = err.context.map((e) => `${e.key}(${JSON.stringify(e.actual)})`).join('/')

  return `invalid value ${err.value} in ${path}`
}

const reporter = (validation: t.Validation<any>): string => {
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

export const applyToSession = <R>(
  f: (a: { decoded: R; httpResponse: HttpResponse }) => ICloudSession,
) =>
  (
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
export const withResponse = (httpResponse: HttpResponse) =>
  pipe(
    TE.Do,
    TE.bind('httpResponse', () => TE.of<Error, HttpResponse>(httpResponse)),
  )
