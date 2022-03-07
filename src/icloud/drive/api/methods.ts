import * as E from 'fp-ts/Either'
import * as A from 'fp-ts/lib/Array'
import { flow, hole, pipe } from 'fp-ts/lib/function'
import * as NA from 'fp-ts/lib/NonEmptyArray'
import { Predicate } from 'fp-ts/lib/Predicate'
import * as SRTE from 'fp-ts/lib/StateReaderTaskEither'
import * as TE from 'fp-ts/TaskEither'
import { BadRequestError, err, InvalidGlobalSessionError, MissingResponseBody } from '../../../lib/errors'
import { HttpResponse } from '../../../lib/http/fetch-client'
import { NEA, XXX } from '../../../lib/types'
import { AuthorizedState, authorizeSessionM } from '../../authorization/authorize'
import { authorizationHeaders } from '../../authorization/headers'
import { apiHttpRequest, applyCookiesToSession, HttpRequestConfig } from '../../session/session-http'
import { headers } from '../../session/session-http-headers'
import { getMissedFound } from '../helpers'
import * as RQ from '../requests'
import { AuthorizedRequest, RequestEnv } from '../requests/request'
import * as T from '../requests/types/types'
import * as API from './type'

type MissedFoundDetails = {
  missed: string[]
  found: (T.Details)[]
}

export const retrieveItemDetailsInFoldersS = <S extends AuthorizedState>(
  drivewsids: NEA<string>,
): XXX<S, API.Use<'retrieveItemDetailsInFolders'>, MissedFoundDetails> =>
  pipe(
    SRTE.ask<S, API.Use<'retrieveItemDetailsInFolders'>, Error>(),
    SRTE.chainW(_ => _.retrieveItemDetailsInFolders<S>({ drivewsids })),
    SRTE.map(ds => getMissedFound(drivewsids, ds)),
  )

export const retrieveItemDetailsInFolder = <S extends AuthorizedState>(
  drivewsid: string,
): XXX<S, API.Use<'retrieveItemDetailsInFolders'>, (T.Details | T.InvalidId)> =>
  pipe(
    SRTE.ask<S, API.Use<'retrieveItemDetailsInFolders'>, Error>(),
    SRTE.chainW(_ => _.retrieveItemDetailsInFolders<S>({ drivewsids: [drivewsid] })),
    SRTE.map(
      NA.head,
    ),
  )

export const getUrl = <S extends AuthorizedState>(
  opts: { docwsid: string; zone: string },
): XXX<S, API.Use<'downloadM'>, string | undefined> =>
  pipe(
    SRTE.ask<S, API.Use<'downloadM'>>(),
    SRTE.chainW(_ => _.downloadM(opts)),
    SRTE.map(
      _ => _.data_token?.url ?? _.package_token?.url,
    ),
  )

export const downloadBatch = <S extends AuthorizedState>(
  opts: { docwsids: string[]; zone: string },
) =>
  pipe(
    SRTE.ask<S, API.Use<'downloadBatchM'>, Error>(),
    SRTE.chainW(_ => _.downloadBatchM(opts)),
    // SRTE.map(
    //   A.map(_ => _.data_token?.url ?? _.package_token?.url),
    // ),
  )

export const renameItems = <S extends AuthorizedState>(
  opts: {
    items: { drivewsid: string; etag: string; name: string; extension?: string }[]
  },
) =>
  pipe(
    SRTE.ask<S, API.Use<'renameItemsM'>>(),
    SRTE.chainW(_ => _.renameItemsM(opts)),
  )

export const moveItems = <S extends AuthorizedState>() =>
  pipe(
    SRTE.asks<S, API.Use<'moveItemsM'>, API.ApiType['moveItemsM']>(_ => _.moveItemsM),
    // SRTE.chainW(_ => _.renameItemsM(opts)),
  )
