import { pipe } from 'fp-ts/lib/function'
import * as O from 'fp-ts/lib/Option'
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
import { expectJson } from '../drive/requests/filterStatus'
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
      'https://setup.icloud.com/setup/ws/1/validate?clientBuildNumber=2116Project44&clientMasteringNumber=2116B28&clientId=f4058d20-0430-4cd5-bb85-7eb9b47fc94e',
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
