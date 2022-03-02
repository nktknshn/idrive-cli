import * as SRTE from 'fp-ts/lib/StateReaderTaskEither'
import * as TE from 'fp-ts/lib/TaskEither'
import { Readable } from 'stream'
import { FetchClient, FetchClientEither } from '../../../lib/http/fetch-client'
import { NEA, XX, XXX } from '../../../lib/types'
import { AuthorizedState, authorizeSessionM } from '../../authorization/authorize'
import { CreateFoldersResponse, MoveItemToTrashResponse, RenameResponse } from '../requests'
import { DownloadResponseBody } from '../requests/download'
import { MoveItemsResponse } from '../requests/moveItems'
import * as T from './../requests/types/types'

type ESRTE<S, R, A> = SRTE.StateReaderTaskEither<S, R, Error, A>
type STE<S, A> = SRTE.StateReaderTaskEither<S, {}, Error, A>

export type RetrieveItemDetailsInFolders = <S extends AuthorizedState>(
  { drivewsids }: { drivewsids: NEA<string> },
) => STE<S, NEA<(T.Details | T.InvalidId)>>

export type Use<K extends keyof ApiType> = Record<K, ApiType[K]>

export type ApiType = {
  retrieveItemDetailsInFolders: RetrieveItemDetailsInFolders

  downloadM: <S extends AuthorizedState>(
    { docwsid: documentId, zone }: {
      docwsid: string
      zone: string
    },
  ) => STE<S, DownloadResponseBody>

  downloadBatchM: <S extends AuthorizedState>(
    { docwsids, zone }: { docwsids: string[]; zone: string },
  ) => STE<S, DownloadResponseBody[]>

  moveItemsM: <S extends AuthorizedState>(
    { items, destinationDrivewsId }: {
      destinationDrivewsId: string
      items: { drivewsid: string; etag: string }[]
    },
  ) => STE<S, MoveItemsResponse>

  renameItemsM: <S extends AuthorizedState>(
    { items }: {
      items: { drivewsid: string; etag: string; name: string; extension?: string }[]
    },
  ) => STE<S, RenameResponse>

  createFoldersM: <S extends AuthorizedState>(
    { names, destinationDrivewsId }: {
      destinationDrivewsId: string
      names: string[]
    },
  ) => XX<S, CreateFoldersResponse>

  putBackItemsFromTrashM: <S extends AuthorizedState>(
    items: [{ drivewsid: string; etag: string }],
  ) => XX<S, { items: T.DriveChildrenItem[] }>

  moveItemsToTrashM: <S extends AuthorizedState>(
    { items, trash }: {
      items: { drivewsid: string; etag: string }[]
      trash?: boolean
    },
  ) => XX<S, MoveItemToTrashResponse>

  upload: <S extends AuthorizedState>(
    { sourceFilePath, docwsid, fname, zone }: { zone: string; sourceFilePath: string; docwsid: string; fname?: string },
  ) => XX<S, {
    status: { status_code: number; error_message: string }
    etag: string
    zone: string
    type: string
    document_id: string
    parent_id: string
    mtime: number
  }>

  fetchClient: FetchClientEither

  getUrlStream({ url }: {
    url: string
  }): TE.TaskEither<Error, Readable>
}
