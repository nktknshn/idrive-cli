import * as E from 'fp-ts/lib/Either'
import * as RTE from 'fp-ts/lib/ReaderTaskEither'
import { DriveQuery, T } from '../../../../../icloud/drive'

import { XXX } from '../../../../../util/types'

export type DownloadItem = (readonly [remotepath: string, remotefile: T.DriveChildrenItemFile])

export type DownloadTask = {
  dirstruct: string[]
  downloadable: DownloadItem[]
  empties: DownloadItem[]
}

export type DownloadItemMapped = { info: DownloadItem; localpath: string }

export type DownloadTaskLocalMapping = {
  localdirstruct: string[]
  downloadable: DownloadItemMapped[]
  empties: DownloadItemMapped[]
}

export type DownloadTaskMapper<R> = (ds: DownloadTask) => RTE.ReaderTaskEither<
  R,
  Error,
  DownloadTaskLocalMapping & { initialTask: DownloadTaskLocalMapping }
>

export type DownloadFileResult = [
  status: E.Either<Error, void>,
  task: readonly [url: string, localpath: string],
]

export type DownloadICloudFilesFunc<R> = (task: { downloadable: DownloadItemMapped[] }) => XXX<
  DriveQuery.State,
  R,
  DownloadFileResult[]
>

// export type FilterTreeResult = DownloadStructure & {
//   excluded: DownloadInfo[]
// }

export type DownloadUrlToFile<R> = (
  url: string,
  destpath: string,
) => RTE.ReaderTaskEither<R, Error, void>
