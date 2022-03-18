import { isRight } from 'fp-ts/lib/Either'
import { flow, pipe } from 'fp-ts/lib/function'
import * as O from 'fp-ts/lib/Option'
import * as SRTE from 'fp-ts/lib/StateReaderTaskEither'
import * as TE from 'fp-ts/lib/TaskEither'
import * as fs from 'fs/promises'
import * as t from 'io-ts'
import {
  BufferDecodingError,
  err,
  FileReadingError,
  InvalidGlobalSessionError,
  JsonParsingError,
  TypeDecodingError,
} from '../../lib/errors'
import { tryReadJsonFile } from '../../lib/files'
import * as AR from '../drive/requests/request'
import { ICloudSessionWithSessionToken } from '../session/session'
import { AccountLoginResponseBody } from './types'

const decode = (v: unknown) => t.type({ dsInfo: t.unknown }).decode(v) as t.Validation<AccountLoginResponseBody>

const validateResponseJson = (json: unknown): json is AccountLoginResponseBody => isRight(decode(json))

// export type AccountLoginResponseBodyUnsafe = Partial<AccountLoginResponseBody>

export function validateSessionM(): AR.ApiRequest<O.Option<AccountLoginResponseBody>, {
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
      InvalidGlobalSessionError.is(e)
        ? AR.of(O.none)
        : SRTE.left(e)
    ),
  )
}

export function saveAccountData(
  accountData: AccountLoginResponseBody,
  accountDataFilePath: string,
): TE.TaskEither<Error, void> {
  return TE.tryCatch(
    () => fs.writeFile(accountDataFilePath, JSON.stringify(accountData)),
    (e) => err(`Error writing accountData ${String(e)}`),
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
