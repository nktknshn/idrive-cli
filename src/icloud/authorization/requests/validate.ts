import { isRight } from 'fp-ts/lib/Either'
import { flow, pipe } from 'fp-ts/lib/function'
import * as O from 'fp-ts/lib/Option'
import * as RTE from 'fp-ts/lib/ReaderTaskEither'
import * as SRTE from 'fp-ts/lib/StateReaderTaskEither'
import * as TE from 'fp-ts/lib/TaskEither'
import * as t from 'io-ts'
import {
  BufferDecodingError,
  err,
  FileReadingError,
  InvalidGlobalSessionError,
  JsonParsingError,
  TypeDecodingError,
} from '../../../util/errors'
import { tryReadJsonFile } from '../../../util/files'
import { DepFs } from '../../deps'
import * as AR from '../../request/request'
import { ICloudSessionWithSessionToken } from '../../session/session'
import { AccountData } from './../types'

const decode = (v: unknown) => t.type({ dsInfo: t.unknown }).decode(v) as t.Validation<AccountData>

const validateResponseJson = (json: unknown): json is AccountData => isRight(decode(json))

// export type AccountLoginResponseBodyUnsafe = Partial<AccountLoginResponseBody>

export function validateSessionM(): AR.ApiRequest<O.Option<AccountData>, {
  session: ICloudSessionWithSessionToken
}> {
  return pipe(
    AR.buildRequestC<{ session: ICloudSessionWithSessionToken }, AR.RequestEnv>(() => ({
      method: 'POST',
      url: 'https://setup.icloud.com/setup/ws/1/validate',
      options: { addClientInfo: true },
    })),
    AR.handleResponse(AR.basicJsonResponse(
      v => t.type({ dsInfo: t.unknown }).decode(v) as t.Validation<AccountData>,
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
  accountData: AccountData,
  accountDataFilePath: string,
): RTE.ReaderTaskEither<DepFs<'writeFile'>, Error, void> {
  return ({ fs: { writeFile } }) => writeFile(accountDataFilePath, JSON.stringify(accountData))
}

export function readAccountData(
  accountDataFilePath: string,
): RTE.ReaderTaskEither<
  DepFs<'readFile'>,
  FileReadingError | JsonParsingError | BufferDecodingError | TypeDecodingError,
  AccountData
> {
  return pipe(
    tryReadJsonFile(accountDataFilePath),
    RTE.chainTaskEitherKW((json) => {
      if (validateResponseJson(json)) {
        return TE.right(json)
      }
      return TE.left(
        TypeDecodingError.create([], 'wrong AccountLoginResponseBody'),
      )
    }),
  )
}
