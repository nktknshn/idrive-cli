import * as A from "fp-ts/lib/Array";
import { pipe } from "fp-ts/lib/function";
import * as RTE from "fp-ts/lib/ReaderTaskEither";
import * as O from "fp-ts/Option";
import * as RA from "fp-ts/ReadonlyArray";
import { EmptyObject, NEA } from "../../../util/types";
import { Conflict } from "./download-conflict";
import { DownloadItem, DownloadTaskMapped } from "./types";

export type SolutionAction = "skip" | "overwrite";
export type Solution = readonly [Conflict, SolutionAction];

export type ConflictsSolver<Deps = EmptyObject> = (
  conflicts: NEA<Conflict>,
) => RTE.ReaderTaskEither<Deps, Error, Solution[]>;

export const applySolutions = (
  { downloadable, empties, localdirstruct }: DownloadTaskMapped,
) =>
(solutions: Solution[]): DownloadTaskMapped & {
  initialTask: DownloadTaskMapped;
} => {
  const fa = (d: {
    downloadItem: DownloadItem;
    localpath: string;
  }) =>
    pipe(
      solutions,
      RA.findFirstMap(
        ([conflict, action]) =>
          conflict.mappedItem.downloadItem.item.drivewsid === d.downloadItem.item.drivewsid
            ? O.some([conflict.mappedItem, action] as const)
            : O.none,
      ),
      O.getOrElse(() => [d, "overwrite" as SolutionAction] as const),
    );

  const findAction = (fs: { downloadItem: DownloadItem; localpath: string }[]) =>
    pipe(
      fs,
      A.map((c) => fa(c)),
      A.filterMap(([d, action]) => action === "overwrite" ? O.some(d) : O.none),
    );

  return {
    downloadable: findAction(downloadable),
    empties: findAction(empties),
    localdirstruct,
    initialTask: { downloadable, empties, localdirstruct },
  };
};
