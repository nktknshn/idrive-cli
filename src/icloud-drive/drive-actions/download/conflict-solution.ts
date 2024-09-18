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

export const makeSolutionRecord = (
  solutions: Solution[],
): Record<string, Solution> => R.fromEntries(solutions.map((s) => [s[0].mappedItem.localpath, s]));

export const makeConflictRecord = (
  conflicts: Conflict[],
): Record<string, Conflict> => R.fromEntries(conflicts.map(c => [c.mappedItem.localpath, c]));

export const applySolutions = (
  task: DownloadTaskMapped,
  conflicts: Conflict[],
  solutions: Solution[],
  { skipMissingSolution = false }: {
    /** If there is a conflict but no solution, skip the item */
    skipMissingSolution?: boolean;
  } = {},
): DownloadTaskMapped => {
  const conflictRec = makeConflictRecord(conflicts);
  const solutionRec = makeSolutionRecord(solutions);

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
