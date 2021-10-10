import * as E from 'fp-ts/lib/Either'
import { pipe } from 'fp-ts/lib/function'
import * as O from 'fp-ts/lib/Option'
import * as TE from 'fp-ts/lib/TaskEither'
import * as fs from 'fs/promises'
import * as t from 'io-ts'
import { error, FileReadingError } from '../../lib/errors'
import { FetchClientEither, HttpRequest, HttpResponse } from '../../lib/fetch-client'
import { BufferDecodingError, tryReadJsonFile, TypeDecodingError } from '../../lib/files'
import { ErrorReadingResponseBody, InvalidJsonInResponse, JsonParsingError } from '../../lib/json'
import { createHttpResponseReducer } from '../../lib/response-reducer'
import { buildRecord, isObjectWithOwnProperty } from '../../lib/util'
import { ICloudSessionState, ICloudSessionWithSessionToken } from '../session/session'
import { getBasicRequest, reduceHttpResponseToSession } from '../session/session-http'
import { getAuthorizationHeaders } from '../session/session-http-headers'
import { AccountLoginResponseBody } from './accoutLoginResponseType'

type RequestProps = {
    session: ICloudSessionState
}
type ValidateResponse = ValidateResponse200 | ValidateResponse421
// | ValidateResponseOther

interface ValidateResponse200 {
    readonly tag: 'ValidateResponse200'
    success: true
    unsafeBody: AccountLoginResponseBody
}

interface ValidateResponse421 {
    readonly tag: 'ValidateResponse421'
    success: false
    error: string | number
}

function createRequest(
    { session }: RequestProps
): HttpRequest {
    return new HttpRequest(
        'https://setup.icloud.com/setup/ws/1/validate?clientBuildNumber=2116Project44&clientMasteringNumber=2116B28&clientId=f4058d20-0430-4cd5-bb85-7eb9b47fc94e',
        {
            method: 'POST',
            headers: buildRecord(
                getAuthorizationHeaders(
                    session
                )
            )
        }
    )
}

function getResponse(
    httpResponse: HttpResponse,
    json: E.Either<ErrorReadingResponseBody | InvalidJsonInResponse, unknown>
): E.Either<Error, { httpResponse: HttpResponse, body: ValidateResponse200 | ValidateResponse421 }> {

    if (httpResponse.status == 200 && E.isRight(json)) {
        return E.right({
            body: {
                tag: 'ValidateResponse200' as const,
                success: true as const,
                unsafeBody: json.right as AccountLoginResponseBody
            },
            httpResponse,
        })
    }
    else if (httpResponse.status == 421) {
        return pipe(
            json,
            t.partial({
                error: t.union([t.string, t.number])
            }).decode,
            E.map((json) => ({
                body: {
                    tag: 'ValidateResponse421' as const,
                    success: false as const,
                    error: json.error ?? 'missing error message'
                },
                httpResponse,
            })),
            E.mapLeft(e => error(`error reading JSON: ${e}`))
        )
    }
    else {
        return E.left(error(
            `unexpected response: ${httpResponse.status} ${JSON.stringify(json)}`
        ))
    }
}

const applyResponse = createHttpResponseReducer(
    getResponse,
    (sess, resp) => reduceHttpResponseToSession(sess, resp.httpResponse)
)

export function validateSession({ client, session }: {
    client: FetchClientEither,
    session: ICloudSessionWithSessionToken
}) {
    return pipe(
        session,
        getBasicRequest('POST', 'https://setup.icloud.com/setup/ws/1/validate?clientBuildNumber=2116Project44&clientMasteringNumber=2116B28&clientId=f4058d20-0430-4cd5-bb85-7eb9b47fc94e'),
        client,
        TE.chainW(applyResponse(session)),
        TE.map(({ session, response }) => {
            if (response.body.tag === 'ValidateResponse200') {
                return {
                    session,
                    accountData: response.body.unsafeBody
                }
            }

            return undefined
        }),
        TE.map(O.fromNullable)
    )
}

const validateResponseJson = (json: unknown): json is AccountLoginResponseBody => isObjectWithOwnProperty(json, 'dsInfo')

export type AccountLoginResponseBodyUnsafe = Partial<AccountLoginResponseBody>

export function saveAccountData(
    accountData: AccountLoginResponseBody,
    accountDataFilePath: string
): TE.TaskEither<string, void> {
    return TE.tryCatch(
        () => fs.writeFile(
            accountDataFilePath, JSON.stringify(accountData)
        ),
        e => `Error writing accountData ${String(e)}`
    )
}

export function readAccountData(
    accountDataFilePath: string
): TE.TaskEither<FileReadingError | JsonParsingError | BufferDecodingError | TypeDecodingError, AccountLoginResponseBody> {
    return pipe(
        tryReadJsonFile(accountDataFilePath),
        TE.chainW(
            json => {
                if (validateResponseJson(json)) {
                    return TE.right(json)
                }
                return TE.left(TypeDecodingError.create([], 'wrong AccountLoginResponseBody'))
            }
        )
    )
}