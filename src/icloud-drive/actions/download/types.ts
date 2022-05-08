import * as E from 'fp-ts/lib/Either'
import * as RTE from 'fp-ts/lib/ReaderTaskEither'
import { AuthorizedState } from '../../../icloud-core/icloud-request'
import { DriveLookup, T } from '../..'

import { DownloadFileResult } from '../../../util/http/downloadUrlToFile'
import { XXX } from '../../../util/types'

export type DownloadItem = (readonly [
  remotepath: string,
  remotefile: T.DriveChildrenItemFile,
])

export type DownloadTask = {
  dirstruct: string[]
  downloadable: DownloadItem[]
  empties: DownloadItem[]
}

export type DownloadItemMapped = {
  remoteitem: DownloadItem
  localpath: string
}

export type DownloadTaskMapped = {
  localdirstruct: string[]
  downloadable: DownloadItemMapped[]
  empties: DownloadItemMapped[]
}

export type DownloadTaskMappedRTE<Deps> = {
  localdirstruct: RTE.ReaderTaskEither<Deps, Error, string>[]
  downloadable: RTE.ReaderTaskEither<Deps, Error, DownloadItemMapped>[]
  empties: RTE.ReaderTaskEither<Deps, Error, DownloadItemMapped>[]
}

export type DownloadTaskMapper<R> = (ds: DownloadTask) => RTE.ReaderTaskEither<
  R,
  Error,
  DownloadTaskMapped & { initialTask: DownloadTaskMapped }
>

export type DownloadICloudFilesFunc<R> = <S extends AuthorizedState>(
  task: { downloadable: DownloadItemMapped[] },
) => XXX<S, R, DownloadFileResult[]>

export { DownloadFileResult }
// export type FilterTreeResult = DownloadStructure & {
//   excluded: DownloadInfo[]
// }
