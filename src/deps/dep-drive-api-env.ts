import * as T from '../icloud/drive/icloud-drive-items-types'
import { CreateFoldersResponse, MoveItemToTrashResponse, RenameResponse } from '../icloud/drive/icloud-drive-requests'
import { DownloadResponseBody } from '../icloud/drive/icloud-drive-requests/download'
import { MoveItemsResponse } from '../icloud/drive/icloud-drive-requests/moveItems'
import {
  SingleFileResponse,
  UpdateDocumentsRequest,
  UpdateDocumentsResponse,
  UploadResponse,
} from '../icloud/drive/icloud-drive-requests/upload'
import { AuthorizedState } from '../icloud/request'
import { NEA, XX } from '../util/types'

/** basic api functions with attached dependencies */
export type DriveApiEnv = {
  retrieveItemDetailsInFolders: <S extends AuthorizedState>(
    { drivewsids }: { drivewsids: NEA<string> },
  ) => XX<S, NEA<(T.Details | T.InvalidId)>>

  // retrieveItemDetailsInFoldersRTE: <S extends AuthorizedState>(
  //   { drivewsids }: { drivewsids: NEA<string> },
  // ) => RTE.ReaderTaskEither<{}, Error, [S, NEA<(T.Details | T.InvalidId)>]>

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
    { filename, buffer, url }: { filename: string; buffer: Buffer; url: string },
  ) => XX<S, SingleFileResponse>

  updateDocuments: <S extends AuthorizedState>(
    { zone, data }: { zone: string; data: UpdateDocumentsRequest },
  ) => XX<S, UpdateDocumentsResponse>
  // fetchClient: FetchClientEither

  // authorizeSession: <S extends BasicState>() => XX<S, AccountData>
}
