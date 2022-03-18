import * as SRTE from 'fp-ts/lib/StateReaderTaskEither'
import * as TE from 'fp-ts/lib/TaskEither'
import { Readable } from 'stream'
import { FetchClient, FetchClientEither } from '../../../lib/http/fetch-client'
import { NEA, XX, XXX } from '../../../lib/types'
import { AuthorizedState, authorizeSessionM } from '../../authorization/authorize'
import { AccountLoginResponseBody } from '../../authorization/types'
import { CreateFoldersResponse, MoveItemToTrashResponse, RenameResponse } from '../requests'
import { DownloadResponseBody } from '../requests/download'
import { MoveItemsResponse } from '../requests/moveItems'
import { BasicState } from '../requests/request'
import * as T from './../requests/types/types'
import { SingleFileResponse, UpdateDocumentsRequest, UpdateDocumentsResponse, UploadResponse } from '../requests/upload'

export type Use<K extends keyof ApiDepsType> = Record<K, ApiDepsType[K]>
/** basic api functions and helpers with attached dependencies */
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

  authorizeSession: <S extends BasicState>() => XX<S, AccountLoginResponseBody>
}
