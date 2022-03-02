import * as E from 'fp-ts/Either'
import * as A from 'fp-ts/lib/Array'
import { flow, hole, pipe } from 'fp-ts/lib/function'
import * as NA from 'fp-ts/lib/NonEmptyArray'
import { Predicate } from 'fp-ts/lib/Predicate'
import * as SRTE from 'fp-ts/lib/StateReaderTaskEither'
import * as TE from 'fp-ts/TaskEither'
import { BadRequestError, err, InvalidGlobalSessionError, MissingResponseBody } from '../../../lib/errors'
import { HttpResponse } from '../../../lib/http/fetch-client'
import { NEA } from '../../../lib/types'
import { AuthorizedState, authorizeSessionM } from '../../authorization/authorize'
import { authorizationHeaders } from '../../authorization/headers'
import { apiHttpRequest, applyCookiesToSession, HttpRequestConfig } from '../../session/session-http'
import { headers } from '../../session/session-http-headers'
import { getMissedFound } from '../helpers'
import * as RQ from '../requests'
import { AuthorizedRequest, RequestEnv, State } from '../requests/request'
import * as T from '../requests/types/types'
import * as NT from './type'

type ESRTE<S, R, A> = SRTE.StateReaderTaskEither<S, R, Error, A>
type STE<S, A> = SRTE.StateReaderTaskEither<S, {}, Error, A>

type MissedFoundDetails = {
  missed: string[]
  found: (T.Details)[]
}

export type DepRetrieveItemDetailsInFolders = {
  retrieveItemDetailsInFolders: NT.ApiType['retrieveItemDetailsInFolders']
}

export const retrieveItemDetailsInFoldersS = <S extends AuthorizedState>(
  drivewsids: NEA<string>,
): ESRTE<S, DepRetrieveItemDetailsInFolders, MissedFoundDetails> =>
  pipe(
    SRTE.ask<S, DepRetrieveItemDetailsInFolders, Error>(),
    SRTE.chainW(_ => _.retrieveItemDetailsInFolders<S>({ drivewsids })),
    SRTE.map(ds => getMissedFound(drivewsids, ds)),
  )

export const retrieveItemDetailsInFolder = <S extends AuthorizedState>(
  drivewsid: string,
): ESRTE<S, DepRetrieveItemDetailsInFolders, (T.Details | T.InvalidId)> =>
  pipe(
    SRTE.ask<S, DepRetrieveItemDetailsInFolders, Error>(),
    SRTE.chainW(_ => _.retrieveItemDetailsInFolders<S>({ drivewsids: [drivewsid] })),
    SRTE.map(
      NA.head,
    ),
  )

export const download = <S extends AuthorizedState>(
  opts: {
    docwsid: string
    zone: string
  },
) =>
  pipe(
    SRTE.ask<S, NT.Use<'downloadM'>>(),
    SRTE.chainW(_ => _.downloadM(opts)),
    SRTE.map(
      _ => _.data_token?.url ?? _.package_token?.url,
    ),
  )

export const downloadBatch = <S extends AuthorizedState>(
  opts: { docwsids: string[]; zone: string },
) =>
  pipe(
    SRTE.ask<S, { downloadBatchM: NT.ApiType['downloadBatchM'] }, Error>(),
    SRTE.chainW(_ => _.downloadBatchM(opts)),
    SRTE.map(
      A.map(_ => _.data_token?.url ?? _.package_token?.url),
    ),
  )
