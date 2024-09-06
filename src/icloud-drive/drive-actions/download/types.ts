import * as RTE from 'fp-ts/lib/ReaderTaskEither'
import { AuthenticatedState } from '../../../icloud-core/icloud-request'
import { Types } from '../..'

import { DownloadFileResult } from '../../../util/http/downloadUrlToFile'
import { SRA } from '../../../util/types'

export type DownloadItem = {
  path: string
  item: Types.DriveChildrenItemFile
}

export type DownloadTask = {
  dirstruct: string[]
  downloadable: DownloadItem[]
  empties: DownloadItem[]
}

export type DownloadItemMapped = {
  item: DownloadItem
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

export type DownloadICloudFilesFunc<R> = <S extends AuthenticatedState>(
  task: { downloadable: DownloadItemMapped[] },
) => SRA<S, R, DownloadFileResult[]>

export { type DownloadFileResult }
