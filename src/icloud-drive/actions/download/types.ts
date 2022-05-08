import * as E from 'fp-ts/lib/Either'
import * as RTE from 'fp-ts/lib/ReaderTaskEither'
import { DriveLookup, T } from '../..'

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

export type DownloadItemMapped = { info: DownloadItem; localpath: string }

export type DownloadTaskMapped = {
  localdirstruct: string[]
  downloadable: DownloadItemMapped[]
  empties: DownloadItemMapped[]
}

export type DownloadTaskMapper<R> = (ds: DownloadTask) => RTE.ReaderTaskEither<
  R,
  Error,
  DownloadTaskMapped & { initialTask: DownloadTaskMapped }
>

export type DownloadFileResult = [
  status: E.Either<Error, void>,
  task: readonly [url: string, localpath: string],
]

export type DownloadICloudFilesFunc<R> = (task: { downloadable: DownloadItemMapped[] }) => XXX<
  DriveLookup.State,
  R,
  DownloadFileResult[]
>

// export type FilterTreeResult = DownloadStructure & {
//   excluded: DownloadInfo[]
// }
