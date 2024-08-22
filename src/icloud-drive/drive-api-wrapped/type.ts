import * as STE from 'fp-ts-contrib/StateTaskEither'
import { AuthenticatedState } from '../../icloud-core/icloud-request'
import { NEA, SA } from '../../util/types'
import { CreateFoldersResponse, MoveItemToTrashResponse, RenameResponse } from '../drive-requests'
import { DownloadResponseBody } from '../drive-requests/download'
import { MoveItemsResponse } from '../drive-requests/moveItems'
import {
  SingleFileResponse,
  UpdateDocumentsRequest,
  UpdateDocumentsResponse,
  UploadResponse,
} from '../drive-requests/upload'
import * as T from '../drive-types'

/** Basic ICloud api methods wrapped with handlers and injected with dependencies. */
export type DriveApiWrapped = {
  retrieveItemDetailsInFolders: <S extends AuthenticatedState>(
    { drivewsids }: { drivewsids: NEA<string> },
  ) => SA<S, NEA<(T.Details | T.InvalidId)>>

  download: <S extends AuthenticatedState>(
    { docwsid, zone }: {
      docwsid: string
      zone: string
    },
  ) => SA<S, DownloadResponseBody>

  downloadBatch: <S extends AuthenticatedState>(
    { docwsids, zone }: { docwsids: string[]; zone: string },
  ) => SA<S, DownloadResponseBody[]>

  moveItems: <S extends AuthenticatedState>(
    { items, destinationDrivewsId }: {
      destinationDrivewsId: string
      items: { drivewsid: string; etag: string }[]
    },
  ) => SA<S, MoveItemsResponse>

  renameItems: <S extends AuthenticatedState>(
    { items }: {
      items: { drivewsid: string; etag: string; name: string; extension?: string }[]
    },
  ) => SA<S, RenameResponse>

  createFolders: <S extends AuthenticatedState>(
    { names, destinationDrivewsId }: {
      destinationDrivewsId: string
      names: string[]
    },
  ) => SA<S, CreateFoldersResponse>

  putBackItemsFromTrash: <S extends AuthenticatedState>(
    items: [{ drivewsid: string; etag: string }],
  ) => SA<S, { items: T.DriveChildrenItem[] }>

  moveItemsToTrash: <S extends AuthenticatedState>(
    { items, trash }: {
      items: { drivewsid: string; etag: string }[]
      trash?: boolean
    },
  ) => SA<S, MoveItemToTrashResponse>

  upload: <S extends AuthenticatedState>(
    { zone, contentType, filename, size, type }: {
      zone: string
      contentType: string
      filename: string
      size: number
      type: 'FILE'
    },
  ) => SA<S, UploadResponse>

  singleFileUpload: <S extends AuthenticatedState>(
    { filename, buffer, url }: { filename: string; buffer: Buffer; url: string },
  ) => SA<S, SingleFileResponse>

  updateDocuments: <S extends AuthenticatedState>(
    { zone, data }: { zone: string; data: UpdateDocumentsRequest },
  ) => SA<S, UpdateDocumentsResponse>
}
