import * as t from 'io-ts'
import { Option } from 'fp-ts/lib/Option'
import * as TE from 'fp-ts/lib/TaskEither'
import * as E from 'fp-ts/lib/Either'
import * as O from 'fp-ts/lib/Option'

import { fetchClient, HttpRequest, HttpResponse } from '../../lib/fetch-client'

import { ICloudSessionState, ICloudSessionWithSessionToken } from '../session/session'
import { flow, pipe } from 'fp-ts/lib/function'
import { createHttpResponseReducer } from '../../lib/createHttpResponseReducer'
import { ErrorReadingResponseBody, InvalidJsonInResponse, JsonParsingError } from '../../lib/json'
import { FetchClientEither } from '../../lib/fetch-client'
import { getSessionHeaders } from '../session/session-http-headers'
import { reduceHttpResponseToSession } from '../session/session-http'
import { log } from 'fp-ts/lib/Console'
import { buildRecord, isObjectWithOwnProperty } from '../../lib/util'
import { AccountLoginResponseBody } from './accoutLoginResponseType'
import { FileReadingError } from '../../lib/errors'
import * as fs from 'fs/promises'
import { TypeDecodingError, tryReadJsonFile, BufferDecodingError } from '../../lib/files'

type RequestProps = {
    session: ICloudSessionState
}
type ValidateResponse = ValidateResponse200 | ValidateResponse421
// | ValidateResponseOther

interface ValidateResponse200 {
    httpResponse: HttpResponse
    readonly tag: 'ValidateResponse200'
    success: true
    unsafeBody: AccountLoginResponseBody
}

interface ValidateResponse421 {
    httpResponse: HttpResponse
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
                getSessionHeaders(
                    session
                )
            )
        }
    )
}

function getResponse(
    httpResponse: HttpResponse,
    json: E.Either<ErrorReadingResponseBody | InvalidJsonInResponse, unknown>
): E.Either<string, ValidateResponse> {

    if (httpResponse.status == 200 && E.isRight(json)) {
        return E.right({
            tag: 'ValidateResponse200',
            success: true,
            httpResponse,
            unsafeBody: json.right as AccountLoginResponseBody
        })
    }
    else if (httpResponse.status == 421) {
        return pipe(
            json,
            t.partial({
                error: t.union([t.string, t.number])
            }).decode,
            E.map((json): ValidateResponse421 => ({
                tag: 'ValidateResponse421',
                success: false,
                httpResponse,
                error: json.error ?? 'missing error message'
            })),
            E.mapLeft(e => `error reading JSON: ${e}`)
        )
    }
    else {
        return E.left(`unexpected response: ${httpResponse.status} ${JSON.stringify(json)}`)
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
        createRequest({ session }),
        client,
        TE.chainW(applyResponse(session)),
        TE.map(({ session, response }) => {
            if (response.tag === 'ValidateResponse200') {
                return {
                    session,
                    accountData: response.unsafeBody
                }
                // return [session, response.unsafeBody] as const
            }

            return undefined
        }),
        TE.map(O.fromNullable)
    )
}

const validateAccountLoginResponseBody = (json: unknown): json is AccountLoginResponseBody => isObjectWithOwnProperty(json, 'dsInfo')

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
                if (validateAccountLoginResponseBody(json)) {
                    return TE.right(json)
                }
                return TE.left(TypeDecodingError.create([], 'wrong AccountLoginResponseBody'))
            }
        )
    )
}