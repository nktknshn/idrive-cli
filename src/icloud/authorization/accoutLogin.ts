import * as E from 'fp-ts/lib/Either'
import { apply, flow, pipe } from 'fp-ts/lib/function'
import * as O from 'fp-ts/lib/Option'
import * as TE from 'fp-ts/lib/TaskEither'
import { FetchClientEither } from '../../lib/fetch-client'
import { logger } from '../../lib/logging'
import { basicGetResponse, createHttpResponseReducer } from '../../lib/response-reducer'
import { isObjectWithOwnProperty } from '../../lib/util'
import { ICloudSessionState } from '../session/session'
import { getBasicRequest } from '../session/session-http'
import { headers } from '../session/session-http-headers'
import { AccountLoginResponseBody } from './accoutLoginResponseType'
import { ICloudSessionValidated } from './authorize'


export function requestAccoutLogin(
    client: FetchClientEither,
    session: ICloudSessionState
): TE.TaskEither<Error, ICloudSessionValidated> {
    logger.debug('requestAccoutLogin')

    const applyResponse = createHttpResponseReducer(
        basicGetResponse((json): json is AccountLoginResponseBody =>
            isObjectWithOwnProperty(json, 'appsOrder')),
    )

    return pipe(
        session.sessionToken,
        O.map(sessionToken =>
            getBasicRequest(
                'POST',
                'https://setup.icloud.com/setup/ws/1/accountLogin?clientBuildNumber=2114Project37&clientMasteringNumber=2114B28&clientId=f4058d20-0430-4cd5-bb85-7eb9b47fc94e',
                {
                    data: {
                        "dsWebAuthToken": sessionToken,
                        "trustToken": O.toUndefined(session.trustToken),
                        "accountCountryCode": pipe(session.accountCountry, O.getOrElse(() => 'RUS')),
                        "extended_login": false
                    },
                    headers: [headers.basicHeaders]
                }
            )),
        E.fromOption(() => new Error('session missing sessionToken')),
        TE.fromEither,
        TE.chainW(flow(apply(session), client)),
        TE.chainW(applyResponse(session)),
        TE.map(({ session, response }) => ({
            session,
            accountData: response.body
        }))
    )
}
