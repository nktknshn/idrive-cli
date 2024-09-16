import * as A from "fp-ts/lib/Array";
import { pipe } from "fp-ts/lib/function";
import * as RTE from "fp-ts/lib/ReaderTaskEither";
import * as TE from "fp-ts/lib/TaskEither";
import * as RA from "fp-ts/ReadonlyArray";
import { DepAskConfirmation } from "../../../deps-types";
import { err } from "../../../util/errors";
import { Types } from "../..";
import { ConflictsSolver, Solution, SolutionAction } from "./conflict-solution";
import { ConflictExists, isConflictExists, isConflictStatsError } from "./download-conflict";

const failOnConflicts: ConflictsSolver = () => () =>
  pipe(
    TE.left(err(`conflicts`)),
  );

const skipAll: ConflictsSolver = (conflicts) => () =>
  pipe(
    conflicts,
    A.map(c => [c, "skip"] as const),
    TE.of,
  );

const overwriteAll: ConflictsSolver = (conflicts) => () =>
  pipe(
    conflicts,
    A.map(c => [c, "overwrite"] as const),
    TE.of,
  );

const rename: ConflictsSolver = (conflicts) => () =>
  pipe(
    conflicts,
    A.map((conflict) =>
      conflict.tag === "exists"
        ? [
          {
            ...conflict,
            mappedItem: {
              ...conflict.mappedItem,
              localpath: conflict.mappedItem.localpath + ".new",
            },
          },
          "overwrite",
        ] as const
        : [
          conflict,
          "skip",
        ] as const
    ),
    TE.of,
  );

const overwriteIfSizeDifferent = (
  skipRemotes = (_f: Types.DriveChildrenItemFile) => false,
): ConflictsSolver =>
(conflicts) =>
() =>
  pipe(
    conflicts,
    A.map((conflict) =>
      conflict.tag === "exists"
        ? conflict.localitem.stats.size !== conflict.mappedItem.downloadItem.item.size
            && !skipRemotes(conflict.mappedItem.downloadItem.item)
          ? [conflict, "overwrite" as SolutionAction] as const
          : [conflict, "skip" as SolutionAction] as const
        : [
          conflict,
          "skip",
        ] as const
    ),
    TE.of,
  );

const askAll: ConflictsSolver<DepAskConfirmation> = (conflicts) => {
  return pipe(
    RTE.ask<DepAskConfirmation>(),
    RTE.chainTaskEitherK(({ askConfirmation }) =>
      askConfirmation({
        message: `overwrite?\n${
          pipe(
            conflicts,
            A.filter(isConflictExists),
            A.map((conflict) => conflict.localitem.path),
            _ => _.join("\n"),
          )
        }`,
      })
    ),
    RTE.chainW(a => a ? overwriteAll(conflicts) : failOnConflicts(conflicts)),
  );
};

const askEvery: ConflictsSolver<DepAskConfirmation> = (conflicts) => {
  return pipe(
    RTE.ask<DepAskConfirmation>(),
    RTE.chainTaskEitherK(({ askConfirmation }) =>
      pipe(
        conflicts,
        A.filter(isConflictExists),
        A.map((conflict) =>
          askConfirmation({
            message:
              `Overwrite ${conflict.localitem.path} ${conflict.localitem.stats.size} bytes with ${conflict.mappedItem.downloadItem.item.size} bytes`,
          })
        ),
        TE.sequenceSeqArray,
      )
    ),
    RTE.map(RA.zip(conflicts)),
    RTE.map(RA.map(
      ([ov, conflict]) =>
        ov
          ? [conflict, "overwrite"] as const
          : [conflict, "skip"] as const,
    )),
    RTE.map(RA.toArray),
  );
};

export const defaultSolver: ConflictsSolver<DepAskConfirmation> = (conflicts) => ({ askConfirmation }) => {
  const statsConflicts = pipe(conflicts, A.filter(isConflictStatsError));
  const existsConflicts = pipe(conflicts, A.filter(isConflictExists));

  if (statsConflicts.length > 0) {
    return TE.left(
      err(`Error getting stats for ${statsConflicts[0].mappedItem.localpath}: ${statsConflicts[0].error}`),
    );
  }

  const askConflict = (c: ConflictExists): TE.TaskEither<Error, Solution> => {
    const localSize = c.localitem.stats.size;
    const remoteSize = c.mappedItem.downloadItem.item.size;
    const localPath = c.localitem.path;
    const remotePath = c.mappedItem.downloadItem.path;

    const remoteModified = new Date(c.mappedItem.downloadItem.item.dateModified);
    const localModified = new Date(c.localitem.stats.mtime);

    const message =
      `overwrite ${localPath} (${localSize} bytes, ${localModified}) with ${remotePath} (${remoteSize} bytes, ${remoteModified})?`;

    return pipe(
      askConfirmation({
        message,
        options: ["yes", "no", "yes for all"],
      }),
      TE.map((decision): Solution =>
        decision === "yes"
          ? [c, "overwrite"]
          : decision === "yes for all"
          ? [c, "overwrite"]
          : [c, "skip"]
      ),
    );
  };

  return pipe(
    existsConflicts,
    A.map((conflict) => askConflict(conflict)),
    A.sequence(TE.ApplicativeSeq),
  );
};

export const solvers = {
  defaultSolver,
  failOnConflicts,
  skipAll,
  overwriteAll,
  rename,
  overwriteIfSizeDifferent,
  askAll,
  askEvery,
};
