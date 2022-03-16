import * as A from 'fp-ts/lib/Array'
import { flow, pipe } from 'fp-ts/lib/function'
import * as NA from 'fp-ts/lib/NonEmptyArray'
import * as SRTE from 'fp-ts/lib/StateReaderTaskEither'
import { err } from '../../../lib/errors'
import { NEA } from '../../../lib/types'
import { AuthorizedState } from '../../authorization/authorize'
import { getMissedFound } from '../helpers'
import * as T from '../requests/types/types'
import * as API from './type'

const getMethod = <R>() =>
  <Args extends unknown[], S extends AuthorizedState, R1 extends R, A>(
    f: (r: R) => (...args: Args) => SRTE.StateReaderTaskEither<S, R1, Error, A>,
  ) =>
    (...args: Args) =>
      pipe(
        SRTE.ask<S, R>(),
        SRTE.map(f),
        SRTE.chain(f => f(...args)),
      )

export const retrieveItemDetailsInFoldersS = <S extends AuthorizedState>(drivewsids: NEA<string>) =>
  pipe(
    getMethod<API.Use<'retrieveItemDetailsInFolders'>>()(_ => _.retrieveItemDetailsInFolders)<S>({ drivewsids }),
    SRTE.map(ds => getMissedFound(drivewsids, ds)),
  )

export const retrieveItemDetailsInFolder = flow(
  getMethod<API.Use<'retrieveItemDetailsInFolders'>>()(_ => _.retrieveItemDetailsInFolders),
  SRTE.map(
    NA.head,
  ),
)

export const getUrl = flow(
  getMethod<API.Use<'downloadM'>>()(_ => _.downloadM),
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

export const renameItems = flow(
  getMethod<API.Use<'renameItemsM'>>()(_ => _.renameItemsM),
)
export const upload = flow(
  getMethod<API.Use<'upload'>>()(_ => _.upload),
)

export const moveItems = flow(
  getMethod<API.Use<'moveItemsM'>>()(_ => _.moveItemsM),
)

export const createFoldersFailing = flow(
  getMethod<API.Use<'createFoldersM'>>()(_ => _.createFoldersM),
  SRTE.map(_ => _.folders),
  SRTE.filterOrElse(
    (folders): folders is T.DriveChildrenItemFolder[] => pipe(folders, A.every((folder) => folder.status === 'OK')),
    () => err(`createFoldersM returned incorrect response. Existing directory?`),
  ),
)
