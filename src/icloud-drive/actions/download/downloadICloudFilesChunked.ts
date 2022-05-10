import * as A from 'fp-ts/lib/Array'
import { flow, pipe } from 'fp-ts/lib/function'
import * as NA from 'fp-ts/lib/NonEmptyArray'
import * as RTE from 'fp-ts/lib/ReaderTaskEither'
import * as RA from 'fp-ts/lib/ReadonlyArray'
import * as R from 'fp-ts/lib/Record'
import * as SRTE from 'fp-ts/lib/StateReaderTaskEither'
import { DepFetchClient, DepFs } from '../../../deps-types'
import { AuthorizedState } from '../../../icloud-core/icloud-request'
import { guardFstRO, isDefined } from '../../../util/guards'
import { DownloadFileResult, downloadUrlsPar } from '../../../util/http/downloadUrlToFile'
import { XXX } from '../../../util/types'
import { DriveApi } from '../..'
import { DownloadICloudFilesFunc, DownloadItemMapped } from './types'

export type Deps =
  & DriveApi.Dep<'downloadBatch'>
  & DepFetchClient
  & DepFs<'createWriteStream'>

export const downloadICloudFilesChunked = (
  { chunkSize = 5 }: { chunkSize: number },
): DownloadICloudFilesFunc<Deps> =>
  <S extends AuthorizedState>(
    { downloadable }: { downloadable: DownloadItemMapped[] },
  ) => {
    return pipe(
      splitIntoChunks(downloadable, chunkSize),
      A.map(c => downloadChunkPar<S>(c)),
      SRTE.sequenceArray,
      SRTE.map(flow(RA.toArray, A.flatten)),
    )
  }

const splitIntoChunks = (
  files: DownloadItemMapped[],
  chunkSize = 5,
): NA.NonEmptyArray<DownloadItemMapped>[] => {
  const filesChunks = []

  const byZone = pipe(
    files,
    NA.groupBy((c) => c.remoteitem[1].zone),
  )

  for (const zone of R.keys(byZone)) {
    filesChunks.push(...A.chunksOf(chunkSize)(byZone[zone]))
  }

  return filesChunks
}

const downloadChunkPar = <S extends AuthorizedState>(
  chunk: NA.NonEmptyArray<DownloadItemMapped>,
): XXX<S, Deps, DownloadFileResult[]> => {
  return pipe(
    DriveApi.downloadBatch<S>({
      docwsids: chunk.map(_ => _.remoteitem[1]).map(_ => _.docwsid),
      zone: NA.head(chunk).remoteitem[1].zone,
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
