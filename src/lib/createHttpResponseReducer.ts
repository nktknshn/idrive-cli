import * as E from 'fp-ts/lib/Either';
import * as TE from 'fp-ts/lib/TaskEither';
import { pipe } from 'fp-ts/lib/function';
import { ICloudSessionState } from '../icloud/session/session';
import { ErrorReadingResponseBody, InvalidJsonInResponse, tryJsonFromResponse } from './json';
import { HttpResponse } from './fetch-client';
import { reduceHttpResponseToSession } from '../icloud/session/session-http';
import { InvalidGlobalSessionResponse, UnexpectedResponse } from './errors';

// import { ErrorReadingResponseBody, InvalidJsonInResponse, tryJsonFromResponse, tryResponseJson } from "./response.ts";
// import { ICloudSessionState } from "./session.ts";

const taskEitherChainEitherW = <E, A, E2, B>(
  f: (v: E.Either<E, A>) => E.Either<E2, B>
) => (
  te: TE.TaskEither<E, A>
): TE.TaskEither<E | E2, B> => TE.flatten(
  TE.fromTask(
    async () => TE.fromEither(f(await te()))
  ))

export type JsonEither = E.Either<ErrorReadingResponseBody | InvalidJsonInResponse, unknown>

export type GetResponse<E, R> = (
  httpResponse: HttpResponse,
  json: JsonEither
) => E.Either<E, R>

export function createHttpResponseReducer<E, R>(
  getResponse: GetResponse<E, { httpResponse: HttpResponse, body: R }>,
  applyToSession: (sess: ICloudSessionState, resp: { httpResponse: HttpResponse, body: R }) => ICloudSessionState = (sess, resp) => reduceHttpResponseToSession(sess, resp.httpResponse)
) {
  return (session: ICloudSessionState) => (resp: HttpResponse) => {
    return pipe(
      tryJsonFromResponse(resp),
      taskEitherChainEitherW(json => getResponse(resp, json)),
      TE.map(response => ({
        session: applyToSession(session, response),
        response
      }))
    );
  };
}


export const basicGetResponse = <R>(
  validateResponseJson: (json: unknown) => json is R
): GetResponse<Error, { httpResponse: HttpResponse, body: R }> => (
  httpResponse, json
) => {
    if (
      httpResponse.status == 200 && E.isRight(json)
    ) {
      if (validateResponseJson(json.right)) {
        return E.right({
          httpResponse,
          body: json.right
        })
      }
      else {
        return E.left(new InvalidJsonInResponse(
          httpResponse,
          JSON.stringify(json.right))
        )
      }
    }
    else if (httpResponse.status == 421) {
      return E.left(new InvalidGlobalSessionResponse(httpResponse))
    }

    return E.left(new UnexpectedResponse(httpResponse, json))
  }
