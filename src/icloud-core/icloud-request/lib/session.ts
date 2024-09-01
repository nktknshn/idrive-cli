import { constant, pipe } from 'fp-ts/lib/function'
import * as SRTE from 'fp-ts/lib/StateReaderTaskEither'
import { HttpResponse } from '../../../util/http/fetch-client'
import { ICloudSession } from '../../session'
import { applyCookiesToSession } from '../../session/session-http'
import { chain, map, readStateAndDeps } from './request'
import { ApiRequest, BaseState, RequestDeps, ValidHttpResponse } from './types'

export const putSession = <S extends { session: ICloudSession }, R extends RequestDeps>(
  session: ICloudSession,
): ApiRequest<void, S, R> =>
  pipe(
    readStateAndDeps<S, R>(),
    chain(({ state }) => SRTE.put({ ...state, session })),
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
          readStateAndDeps<S, R>(),
          chain(({ state: { session } }) => putSession(f(r)(session))),
          map(constant(r)),
        )
      ),
    )

export const applyCookies = <T extends { httpResponse: HttpResponse }>() =>
  applyToSession<T>(({ httpResponse }) => applyCookiesToSession(httpResponse))
