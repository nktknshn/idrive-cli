import * as A from 'fp-ts/lib/Array'
import * as E from 'fp-ts/lib/Either'
import { flow, pipe } from 'fp-ts/lib/function'
import * as NA from 'fp-ts/lib/NonEmptyArray'
import * as RTE from 'fp-ts/lib/ReaderTaskEither'
import * as RA from 'fp-ts/lib/ReadonlyArray'
import * as R from 'fp-ts/lib/Record'
import * as SRTE from 'fp-ts/lib/StateReaderTaskEither'
import { DepFetchClient } from '../../../../deps/DepFetchClient'
import { DepFs } from '../../../../deps/DepFs'
import { DepDriveApiEnv, DriveApi, DriveQuery } from '../../../../icloud/drive'
import { guardFstRO, isDefined } from '../../../../util/guards'
import { XXX } from '../../../../util/types'
import { downloadUrlsPar } from './download-helpers'
import { DownloadICloudFilesFunc, DownloadInfo } from './types'

export const downloadICloudFilesChunked = (
  { chunkSize = 5 },
): DownloadICloudFilesFunc<DepDriveApiEnv<'downloadBatch'> & DepFetchClient & DepFs<'createWriteStream'>> =>
  ({ downloadable }) => {
    return pipe(
      splitIntoChunks(downloadable, chunkSize),
      A.map(downloadChunkPar),
      SRTE.sequenceArray,
      SRTE.map(flow(RA.toArray, A.flatten)),
    )
  }
const splitIntoChunks = (
  files: { info: DownloadInfo; localpath: string }[],
  chunkSize = 5,
): NA.NonEmptyArray<{ info: DownloadInfo; localpath: string }>[] => {
  const filesChunks = []

  const byZone = pipe(
    files,
    NA.groupBy((c) => c.info[1].zone),
  )

  for (const zone of R.keys(byZone)) {
    filesChunks.push(...A.chunksOf(chunkSize)(byZone[zone]))
  }

  return filesChunks
}
const downloadChunkPar = (
  chunk: NA.NonEmptyArray<{ info: DownloadInfo; localpath: string }>,
): XXX<
  DriveQuery.State,
  DepDriveApiEnv<'downloadBatch'> & DepFetchClient & DepFs<'createWriteStream'>,
  [E.Either<Error, void>, readonly [url: string, path: string]][]
> => {
  return pipe(
    DriveApi.downloadBatch<DriveQuery.State>({
      docwsids: chunk.map(_ => _.info[1]).map(_ => _.docwsid),
      zone: NA.head(chunk).info[1].zone,
    }),
    SRTE.chainW((downloadResponses) => {
      const urls = pipe(
        downloadResponses,
        A.map(_ => _.data_token?.url ?? _.package_token?.url),
      )

      return SRTE.fromReaderTaskEither(pipe(
        A.zip(urls)(chunk),
        A.map(([{ localpath }, url]) => [url, localpath] as const),
        A.filter(guardFstRO(isDefined)),
        RTE.fromReaderTaskK(downloadUrlsPar),
      ))
    }),
  )
}
