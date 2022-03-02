import * as SRTE from 'fp-ts/lib/StateReaderTaskEither'
import { NEA } from '../../../lib/types'
import { AuthorizedState, authorizeSessionM } from '../../authorization/authorize'
import { RenameResponse } from '../requests'
import { DownloadResponseBody } from '../requests/download'
import { MoveItemsResponse } from '../requests/moveItems'
import * as T from './../requests/types/types'

type ESRTE<S, R, A> = SRTE.StateReaderTaskEither<S, R, Error, A>
type STE<S, A> = SRTE.StateReaderTaskEither<S, {}, Error, A>

export type RetrieveItemDetailsInFolders = <S extends AuthorizedState>(
  { drivewsids }: { drivewsids: NEA<string> },
) => STE<S, NEA<(T.Details | T.InvalidId)>>

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
}
