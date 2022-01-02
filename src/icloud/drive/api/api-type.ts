import { Kind, URIS } from 'fp-ts/lib/HKT'
import * as RQ from '../requests'
import * as T from '../requests/types/types'

interface Api<F extends URIS> {
  upload: (
    sourceFilePath: string,
    docwsid: string,
    fname?: string | undefined,
  ) => Kind<F, { document_id: string; zone: string; parent_id: string; type: string; etag: string }>
  renameItems: (
    items: { drivewsid: string; etag: string; name: string; extension?: string }[],
  ) => Kind<F, RQ.RenameResponse>
  retrieveTrashDetails: () => Kind<F, T.DetailsTrash>
  putBackItemsFromTrash: (items: [{ drivewsid: string; etag: string }]) => Kind<F, {
    items: T.DriveChildrenItem[]
  }>
  retrieveItemDetailsInFolders: (drivewsids: string[]) => Kind<F, (T.Details | T.InvalidId)[]>
  download: (documentId: string, zone: string) => Kind<F, string>
  createFolders: (parentId: string, folderNames: string[]) => Kind<F, RQ.CreateFoldersResponse>
  moveItems: (
    destinationDrivewsId: string,
    items: { drivewsid: string; etag: string }[],
  ) => Kind<F, RQ.MoveItemToTrashResponse>
  moveItemsToTrash: (
    items: { drivewsid: string; etag: string }[],
    trash: boolean,
  ) => Kind<F, RQ.MoveItemToTrashResponse>
}
