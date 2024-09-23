import { pipe } from "fp-ts/lib/function";
import * as RTE from "fp-ts/lib/ReaderTaskEither";
import * as NA from "fp-ts/NonEmptyArray";

import { printerIO } from "../../../logging/printerIO";
import { FsStats } from "../../../util/fs";
import { Path } from "../../../util/path";
import { NEA, SRA } from "../../../util/types";
import { DriveLookup } from "../..";
import { DepApiMethod, DriveApiMethods } from "../../drive-api";
import { parseDrivewsid } from "../../util/drive-helpers";
import { UploadResult } from "./types";

/** Upload a chunk of files in parallel */
export const uploadChunkPar = (
  pathToDrivewsid: Record<string, string>,
) =>
(
  chunk: NEA<
    {
      /** remote path to file (including the filename) */
      remotepath: string;
      /** local path to file */
      item: { path: string; stats: FsStats };
    }
  >,
): SRA<DriveLookup.State, DepApiMethod<"uploadFile">, NEA<UploadResult>> =>
state =>
  pipe(
    chunk,
    NA.map(({ remotepath, item }) => {
      const parentDir = parseDrivewsid(pathToDrivewsid[Path.dirname(remotepath)]);
      return pipe(
        DriveApiMethods.uploadFile<DriveLookup.State>({
          sourceFilePath: item.path,
          docwsid: parentDir.docwsid,
          zone: parentDir.zone,
        })(state),
        RTE.chainFirstIOK(() => printerIO.print(`${remotepath}`)),
      );
    }),
    NA.sequence(RTE.ApplicativePar),
    RTE.map(
      results => [NA.unzip(results)[0], NA.last(results)[1]],
    ),
  );
