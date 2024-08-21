// import * as E from 'fp-ts/lib/Either'
// import * as RTE from 'fp-ts/lib/ReaderTaskEither'
// import { DriveQuery } from '../../../../icloud/drive'
// import * as T from '../../../../icloud/drive/drive-types'

// import { XXX } from '../../../../util/types'

// export type DownloadStructure = {
//   dirstruct: string[]
//   downloadable: DownloadInfo[]
//   empties: DownloadInfo[]
// }

// export type DownloadTask = {
//   localdirstruct: string[]
//   downloadable: { info: DownloadInfo; localpath: string }[]
//   empties: { info: DownloadInfo; localpath: string }[]
// }

// export type CreateDownloadTask<R> = (ds: DownloadStructure) => RTE.ReaderTaskEither<
//   R,
//   Error,
//   DownloadTask & { initialTask: DownloadTask }
// >

// export type DownloadFileResult = [E.Either<Error, void>, readonly [url: string, localpath: string]]

// export type DownloadICloudFilesFunc<R> = (task: { downloadable: { info: DownloadInfo; localpath: string }[] }) => XXX<
//   DriveQuery.State,
//   R,
//   DownloadFileResult[]
// >

// export type DownloadInfo = (readonly [remotepath: string, remotefile: T.DriveChildrenItemFile])

// export type FilterTreeResult = DownloadStructure & {
//   excluded: DownloadInfo[]
// }

// export type DownloadUrlToFile<R> = (
//   url: string,
//   destpath: string,
// ) => RTE.ReaderTaskEither<R, Error, void>
