import * as A from "fp-ts/lib/Array";
import { pipe } from "fp-ts/lib/function";
import * as RTE from "fp-ts/lib/ReaderTaskEither";
import * as R from "fp-ts/lib/Record";
import * as O from "fp-ts/Option";
import { EmptyObject, NEA } from "../../../util/types";
import { Conflict } from "./download-conflict";
import { DownloadItemMapped, DownloadTaskMapped } from "./types";

export type SolutionAction = "skip" | "overwrite";
export type Solution = readonly [Conflict, SolutionAction];

export type ConflictsSolver<Deps = EmptyObject> = (
  conflicts: NEA<Conflict>,
) => RTE.ReaderTaskEither<Deps, Error, Solution[]>;

export const applySolutions = (
  task: DownloadTaskMapped,
  conflicts: Conflict[],
  solutions: Solution[],
  { skipMissingSolution = false }: {
    /** If there is a conflict but no solution, skip the item */
    skipMissingSolution?: boolean;
  } = {},
): DownloadTaskMapped => {
  const conflictRec = R.fromEntries(conflicts.map(c => [c.mappedItem.localpath, c]));
  const solutionRec = R.fromEntries(solutions.map((s) => [s[0].mappedItem.localpath, s]));

  const shouldStay = (item: DownloadItemMapped): boolean => {
    const conflict = R.lookup(item.localpath, conflictRec);
    const solution = R.lookup(item.localpath, solutionRec);

    // if there is no conflict and no mention of the item in the solutions
    if (!O.isSome(conflict) && !O.isSome(solution)) {
      return true;
    }

    // will be skipped if there is a conflict but no solution
    if (skipMissingSolution && O.isSome(conflict) && !O.isSome(solution)) {
      return false;
    }

    if (O.isSome(solution)) {
      return solution.value[1] === "overwrite";
    }

    return false;
  };

  const downloadable = pipe(
    task.downloadable,
    A.filter(shouldStay),
  );

  const empties = pipe(
    task.empties,
    A.filter(shouldStay),
  );

  return {
    downloadable,
    empties,
    localdirstruct: task.localdirstruct,
  };
};

// /** Applies solutions to the download task */
// export const applySolutions = (
//   { downloadable, empties, localdirstruct }: DownloadTaskMapped,
//   conflicts: Conflict[],
//   solutions: Solution[],
// ): DownloadTaskMapped => {
//   const fa = (d: {
//     downloadItem: DownloadItem;
//     localpath: string;
//   }) =>
//     pipe(
//       solutions,
//       RA.findFirstMap(
//         ([conflict, action]) =>
//           conflict.mappedItem.downloadItem.item.drivewsid === d.downloadItem.item.drivewsid
//             ? O.some([conflict.mappedItem, action] as const)
//             : O.none,
//       ),
//       O.getOrElse(() => [d, "overwrite" as SolutionAction] as const),
//     );

//   const findAction = (fs: { downloadItem: DownloadItem; localpath: string }[]) =>
//     pipe(
//       fs,
//       A.map((c) => fa(c)),
//       A.filterMap(([d, action]) => action === "overwrite" ? O.some(d) : O.none),
//     );

//   return {
//     downloadable: findAction(downloadable),
//     empties: findAction(empties),
//     localdirstruct,
//   };
// };
