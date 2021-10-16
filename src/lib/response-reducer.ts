import * as A from 'fp-ts/lib/Array'
import * as E from 'fp-ts/lib/Either'
import { flow, pipe } from 'fp-ts/lib/function'
import * as O from 'fp-ts/lib/Option'
import * as TE from 'fp-ts/lib/TaskEither'
import { ICloudSession as ICloudSession, SessionLens } from '../icloud/session/session'
import { applyCookieToCookies, parseSetCookie } from './cookie'
import { InvalidGlobalSessionResponse, InvalidJsonInResponse, MissingResponseBody, UnexpectedResponse } from './errors'
import { HttpResponse } from './fetch-client'
import { getSetCookie } from './http-headers'
import { tryJsonFromResponse } from './json'
import { logger } from './logging'
import { separateEithers } from './util'
// import { ErrorReadingResponseBody, InvalidJsonInResponse, tryJsonFromResponse, tryResponseJson } from "./response.ts";
// import { ICloudSessionState } from "./session.ts";

const taskEitherChainEitherW = <E, A, E2, B>(f: (v: E.Either<E, A>) => E.Either<E2, B>) =>
  (te: TE.TaskEither<E, A>): TE.TaskEither<E | E2, B> =>
    TE.flatten(TE.fromTask(async () => TE.fromEither(f(await te()))))

export type JsonEither = E.Either<MissingResponseBody | InvalidJsonInResponse, unknown>

export type GetResponse<E, R> = (
  httpResponse: HttpResponse,
  json: JsonEither,
) => E.Either<E, R>

export type ResponseWithSession<R> = {
  session: ICloudSession
  response: {
    httpResponse: HttpResponse
    body: R
  }
}

export type ResponseType<R> = { httpResponse: HttpResponse; body: R }

const getCookies = (httpResponse: HttpResponse) =>
  pipe(
    getSetCookie(httpResponse),
    A.map(parseSetCookie),
    separateEithers,
  )

export const applyCookies = (httpResponse: HttpResponse) =>
  (session: ICloudSession): ICloudSession => {
    const [errors, setCookies] = getCookies(httpResponse)

    if (errors.length > 0) {
      logger.error(
        errors,
      )
    }

    return pipe(
      session,
      SessionLens.cookies.set({
        cookies: applyCookieToCookies(
          session.cookies,
          setCookies,
        ),
      }),
    )
  }

export function createHttpResponseReducer1<E, R>(
  getResponse: GetResponse<E, R>,
  applyToSession: (
    session: ICloudSession,
    httpResponse: HttpResponse,
    response: R,
  ) => ICloudSession = (
    session,
    httpResponse,
  ) => applyCookies(httpResponse)(session),
  onError: (e: E, session: ICloudSession) => ICloudSession = (e, session) => session,
) {
  return (session: ICloudSession) =>
    TE.chainW(
      (
        httpResponse: HttpResponse,
      ): TE.TaskEither<MissingResponseBody | InvalidJsonInResponse | E, ResponseWithSession<R>> => {
        return pipe(
          tryJsonFromResponse(httpResponse),
          taskEitherChainEitherW(json => getResponse(httpResponse, json)),
          TE.map((response) => ({
            session: applyToSession(session, httpResponse, response),
            response: {
              httpResponse,
              body: response,
            },
          })),
        )
      },
    )
}

export const basicGetResponse1 = <R>(
  validateResponseJson: (json: unknown) => json is R,
  validateResponse = (httpResponse: HttpResponse) => httpResponse.status == 200,
): GetResponse<Error, R> =>
  (httpResponse, json) => {
    if (validateResponse(httpResponse) && E.isRight(json)) {
      if (validateResponseJson(json.right)) {
        return E.right(json.right)
      }
      else {
        return E.left(
          new InvalidJsonInResponse(httpResponse, JSON.stringify(json.right)),
        )
      }
    }
    else if (httpResponse.status == 421) {
      return E.left(new InvalidGlobalSessionResponse(httpResponse))
    }

    return E.left(UnexpectedResponse.create(httpResponse, json))
  }

export const expectJson = flow(
  basicGetResponse1,
  createHttpResponseReducer1,
)

// export const expectResponse = <UnexpectedResponse, R>(
//   f: (httpResponse: HttpResponse, json: JsonEither) => O.Option<R>,
// ) =>
//   (httpResponse: HttpResponse, json: JsonEither) =>
//     pipe(
//       f(httpResponse, json),
//       E.fromOption(() => UnexpectedResponse.create(httpResponse, json)),
//     )
