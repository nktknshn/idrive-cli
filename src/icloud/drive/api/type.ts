import { pipe } from 'fp-ts/lib/function'
import * as SRTE from 'fp-ts/lib/StateReaderTaskEither'
import { FetchClientEither } from '../../../lib/http/fetch-client'
import { NEA, XX } from '../../../lib/types'
import { AuthorizedState } from '../../authorization/authorize'
import { AccountData } from '../../authorization/types'
import { CreateFoldersResponse, MoveItemToTrashResponse, RenameResponse } from '../requests'
import { DownloadResponseBody } from '../requests/download'
import { MoveItemsResponse } from '../requests/moveItems'
import { BasicState } from '../requests/request'
import * as T from '../requests/types/types'
import { SingleFileResponse, UpdateDocumentsRequest, UpdateDocumentsResponse, UploadResponse } from '../requests/upload'

export type Dep<K extends keyof ApiDepsType> = Record<K, ApiDepsType[K]>

/** basic api functions and also helpers with attached dependencies */
export type ApiDepsType = {
  retrieveItemDetailsInFolders: <S extends AuthorizedState>(
    { drivewsids }: { drivewsids: NEA<string> },
  ) => XX<S, NEA<(T.Details | T.InvalidId)>>

  download: <S extends AuthorizedState>(
    { docwsid: documentId, zone }: {
      docwsid: string
      zone: string
    },
  ) => XX<S, DownloadResponseBody>

  downloadBatch: <S extends AuthorizedState>(
    { docwsids, zone }: { docwsids: string[]; zone: string },
  ) => XX<S, DownloadResponseBody[]>

  moveItems: <S extends AuthorizedState>(
    { items, destinationDrivewsId }: {
      destinationDrivewsId: string
      items: { drivewsid: string; etag: string }[]
    },
  ) => XX<S, MoveItemsResponse>

  renameItems: <S extends AuthorizedState>(
    { items }: {
      items: { drivewsid: string; etag: string; name: string; extension?: string }[]
    },
  ) => XX<S, RenameResponse>

  createFolders: <S extends AuthorizedState>(
    { names, destinationDrivewsId }: {
      destinationDrivewsId: string
      names: string[]
    },
  ) => XX<S, CreateFoldersResponse>

  putBackItemsFromTrash: <S extends AuthorizedState>(
    items: [{ drivewsid: string; etag: string }],
  ) => XX<S, { items: T.DriveChildrenItem[] }>

  moveItemsToTrash: <S extends AuthorizedState>(
    { items, trash }: {
      items: { drivewsid: string; etag: string }[]
      trash?: boolean
    },
  ) => XX<S, MoveItemToTrashResponse>

  upload: <S extends AuthorizedState>(
    { zone, contentType, filename, size, type }: {
      zone: string
      contentType: string
      filename: string
      size: number
      type: 'FILE'
    },
  ) => XX<S, UploadResponse>

  singleFileUpload: <S extends AuthorizedState>(
    { filePath, url }: { filePath: string; url: string },
  ) => XX<S, SingleFileResponse>

  updateDocuments: <S extends AuthorizedState>(
    { zone, data }: { zone: string; data: UpdateDocumentsRequest },
  ) => XX<S, UpdateDocumentsResponse>

  fetchClient: FetchClientEither

  authorizeSession: <S extends BasicState>() => XX<S, AccountData>
}

export const useApiDepRequest = <R>() =>
  <Args extends unknown[], S extends AuthorizedState, R1 extends R, A>(
    f: (r: R) => (...args: Args) => SRTE.StateReaderTaskEither<S, R1, Error, A>,
  ) =>
    (...args: Args) =>
      pipe(
        SRTE.ask<S, R>(),
        SRTE.map(f),
        SRTE.chain(f => f(...args)),
      )
