import * as A from "fp-ts/lib/Array";
import { constVoid, flow, pipe } from "fp-ts/lib/function";
import * as NA from "fp-ts/lib/NonEmptyArray";
import * as RTE from "fp-ts/lib/ReaderTaskEither";
import * as RA from "fp-ts/lib/ReadonlyArray";
import * as R from "fp-ts/lib/Record";
import * as SRTE from "fp-ts/lib/StateReaderTaskEither";
import * as TE from "fp-ts/TaskEither";
import { DepFetchClient, DepFs } from "../../../deps-types";
import { AuthenticatedState } from "../../../icloud-core/icloud-request";
import { loggerIO } from "../../../logging";
import { guardFstRO, isDefined } from "../../../util/guards";
import { DownloadFileResult, downloadUrlsPar } from "../../../util/http/download-url-to-file";
import { SRA } from "../../../util/types";
import { DepApiMethod, DriveApiMethods } from "../../drive-api";
import { DownloadICloudFilesFunc, DownloadItemMapped, mappedArrayToRecord } from "./types";

export type Deps =
  & DepApiMethod<"downloadBatch">
  & DepFetchClient
  & DepFs<"createWriteStream">
  & DepFs<"utimes">;

export const downloadICloudFilesChunked = (
  { chunkSize = 5, updateTimes = true }: { chunkSize: number; updateTimes?: boolean },
): DownloadICloudFilesFunc<Deps> =>
<S extends AuthenticatedState>(
  { downloadable }: { downloadable: DownloadItemMapped[] },
) => {
  return pipe(
    splitIntoChunks(downloadable, chunkSize),
    A.map(c => downloadChunkPar<S>(c, updateTimes)),
    SRTE.sequenceArray,
    SRTE.map(flow(RA.toArray, A.flatten)),
  );
};

const updateTimeHook =
  (record: Record<string, DownloadItemMapped>) =>
  (destpath: string): RTE.ReaderTaskEither<DepFs<"utimes">, Error, void> =>
  deps =>
    pipe(
      loggerIO.debug(`setting ${destpath} time`),
      TE.fromIO,
      TE.chain(() =>
        deps.fs.utimes(
          destpath,
          new Date(record[destpath].downloadItem.item.dateModified),
          new Date(record[destpath].downloadItem.item.dateModified),
        )
      ),
      TE.map(constVoid),
    );

const downloadChunkPar = <S extends AuthenticatedState>(
  chunk: NA.NonEmptyArray<DownloadItemMapped>,
  updateTime: boolean,
): SRA<S, Deps, DownloadFileResult[]> => {
  const record = mappedArrayToRecord(chunk);
  // FIX it sets wrong times
  const postDownload = updateTimeHook(record);

  return pipe(
    DriveApiMethods.downloadBatch<S>({
      docwsids: chunk.map(_ => _.downloadItem.item).map(_ => _.docwsid),
      zone: NA.head(chunk).downloadItem.item.zone,
    }),
    SRTE.chainW((downloadResponses) => {
      const urls = pipe(
        downloadResponses,
        A.map(_ => _.data_token?.url ?? _.package_token?.url),
      );

      return SRTE.fromReaderTaskEither(pipe(
        A.zip(urls)(chunk),
        A.map(([{ localpath }, url]) => [url, localpath] as const),
        A.filter(guardFstRO(isDefined)),
        RTE.fromReaderTaskK(downloadUrlsPar<Deps>),
        RTE.local((deps: Deps) => ({
          ...deps,
          postDownload: updateTime
            ? postDownload
            : undefined,
        })),
      ));
    }),
  );
};

const splitIntoChunks = (
  files: DownloadItemMapped[],
  chunkSize = 5,
): NA.NonEmptyArray<DownloadItemMapped>[] => {
  const filesChunks = [];

  const byZone = pipe(
    files,
    NA.groupBy((c) => c.downloadItem.item.zone),
  );

  for (const zone of R.keys(byZone)) {
    filesChunks.push(...A.chunksOf(chunkSize)(byZone[zone]));
  }

  return filesChunks;
};
