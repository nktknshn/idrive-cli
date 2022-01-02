import { flow, pipe } from 'fp-ts/lib/function'
import * as O from 'fp-ts/lib/Option'
import * as SRTE from 'fp-ts/lib/StateReaderTaskEither'
import * as TE from 'fp-ts/lib/TaskEither'
import * as fs from 'fs/promises'
import * as t from 'io-ts'
import {
  BufferDecodingError,
  FileReadingError,
  InvalidGlobalSessionResponse,
  JsonParsingError,
  TypeDecodingError,
} from '../../lib/errors'
import { tryReadJsonFile } from '../../lib/files'
import { FetchClientEither } from '../../lib/http/fetch-client'
import { isObjectWithOwnProperty } from '../../lib/util'
import { expectJson } from '../drive/requests/http'
import * as AR from '../drive/requests/reader'
import { ICloudSessionWithSessionToken } from '../session/session'
import { buildRequest } from '../session/session-http'
import { ICloudSessionValidated } from './authorize'
import { AccountLoginResponseBody } from './types'

const validateResponseJson = (json: unknown): json is AccountLoginResponseBody =>
  isObjectWithOwnProperty(json, 'dsInfo')

// export type AccountLoginResponseBodyUnsafe = Partial<AccountLoginResponseBody>

export function validateSession(
  { client, session }: {
    client: FetchClientEither
    session: ICloudSessionWithSessionToken
  },
): TE.TaskEither<Error, O.Option<ICloudSessionValidated>> {
  const applyResponse = expectJson(
    v => t.type({ dsInfo: t.unknown }).decode(v) as t.Validation<AccountLoginResponseBody>,
  )

  return pipe(
    session,
    buildRequest(
      'POST',
      'https://setup.icloud.com/setup/ws/1/validate',
      { addClientInfo: true },
    ),
    client,
    applyResponse(session),
    TE.map(({ response, session }) =>
      O.some({
        session,
        accountData: response.body,
      })
    ),
    TE.orElse((e) => InvalidGlobalSessionResponse.is(e) ? TE.of(O.none) : TE.left(e)),
  )
}

export function validateSessionM(): AR.ApiSessionRequest<O.Option<AccountLoginResponseBody>, {
  session: ICloudSessionWithSessionToken
}> {
  return pipe(
    AR.buildRequestC<{ session: ICloudSessionWithSessionToken }>(() => ({
      method: 'POST',
      url: 'https://setup.icloud.com/setup/ws/1/validate',
      options: { addClientInfo: true },
    })),
    AR.handleResponse(flow(
      AR.basicJsonResponse(
        v => t.type({ dsInfo: t.unknown }).decode(v) as t.Validation<AccountLoginResponseBody>,
      ),
    )),
    AR.map(O.some),
    AR.orElse((e) =>
      InvalidGlobalSessionResponse.is(e)
        ? AR.of(O.none)
        : AR.left(e)
    ),
  )
}

export function saveAccountData(
  accountData: AccountLoginResponseBody,
  accountDataFilePath: string,
): TE.TaskEither<string, void> {
  return TE.tryCatch(
    () => fs.writeFile(accountDataFilePath, JSON.stringify(accountData)),
    (e) => `Error writing accountData ${String(e)}`,
  )
}

export function readAccountData(
  accountDataFilePath: string,
): TE.TaskEither<
  FileReadingError | JsonParsingError | BufferDecodingError | TypeDecodingError,
  AccountLoginResponseBody
> {
  return pipe(
    tryReadJsonFile(accountDataFilePath),
    TE.chainW((json) => {
      if (validateResponseJson(json)) {
        return TE.right(json)
      }
      return TE.left(
        TypeDecodingError.create([], 'wrong AccountLoginResponseBody'),
      )
    }),
  )
}
