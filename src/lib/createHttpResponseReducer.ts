import * as E from 'fp-ts/lib/Either';
import * as TE from 'fp-ts/lib/TaskEither';
import { pipe } from 'fp-ts/lib/function';
import { ICloudSessionState } from '../icloud/session/session';
import { ErrorReadingResponseBody, InvalidJsonInResponse, tryJsonFromResponse } from './json';
import { HttpResponse } from './fetch-client';

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

export function createHttpResponseReducer<E, R>(
  getResponse: (
    httpResponse: HttpResponse,
    json: JsonEither
  ) => E.Either<E, R>,
  applyToSession: (sess: ICloudSessionState, resp: R) => ICloudSessionState
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
