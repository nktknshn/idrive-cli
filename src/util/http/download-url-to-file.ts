import * as A from "fp-ts/lib/Array";
import * as E from "fp-ts/lib/Either";
import { pipe } from "fp-ts/lib/function";
import * as RT from "fp-ts/lib/ReaderTask";
import * as RTE from "fp-ts/lib/ReaderTaskEither";

import { DepFetchClient, DepFs } from "../../deps-types";
import { loggerIO } from "../../logging/loggerIO";
import { printerIO } from "../../logging/printerIO";
import { writeFileFromReadable } from "../fs/write-file";
import { getUrlStream } from "./getUrlStream";

export type HookPostDownload<R> = (destpath: string) => RTE.ReaderTaskEither<R, Error, void>;

export type DownloadUrlToFile<R> = (
  url: string,
  destpath: string,
) => RTE.ReaderTaskEither<R, Error, void>;

type Deps<THookDeps> =
  & DepFetchClient
  & DepFs<"createWriteStream">
  & { postDownload?: HookPostDownload<THookDeps> }
  & { preDownload?: HookPostDownload<THookDeps> }
  & THookDeps;

export const downloadUrlToFile = <THookDeps>(
  url: string,
  destpath: string,
): RTE.ReaderTaskEither<Deps<THookDeps>, Error, void> =>
  pipe(
    loggerIO.debug(`getting ${destpath}`),
    RTE.fromIO,
    RTE.chain(() =>
      RTE.asksReaderTaskEitherW((deps: Deps<THookDeps>) =>
        deps.preDownload
          ? deps.preDownload(destpath)
          : RTE.right(undefined)
      )
    ),
    RTE.chainW(() => getUrlStream({ url })),
    RTE.orElseFirst((err) => RTE.fromIO(loggerIO.error(`${err}`))),
    RTE.chainFirstIOK(() => loggerIO.debug(`writing ${destpath}`)),
    RTE.chainW(writeFileFromReadable(destpath)),
    RTE.orElseFirst((err) => RTE.fromIO(printerIO.print(`${err}`))),
    RTE.chain(() =>
      RTE.asksReaderTaskEitherW((deps: Deps<THookDeps>) =>
        deps.postDownload
          ? deps.postDownload(destpath)
          : RTE.right(undefined)
      )
    ),
  );

export type DownloadFileResult = [
  status: E.Either<Error, void>,
  task: readonly [url: string, localpath: string],
];

/** Parallel download of files from urls */
export const downloadUrlsPar = <R>(
  urlDest: Array<readonly [url: string, localpath: string]>,
): RT.ReaderTask<Deps<R>, DownloadFileResult[]> => {
  return pipe(
    urlDest,
    A.map(([u, d]) => downloadUrlToFile<R>(u, d)),
    A.sequence(RT.ApplicativePar),
    RT.map(A.zip(urlDest)),
  );
};
