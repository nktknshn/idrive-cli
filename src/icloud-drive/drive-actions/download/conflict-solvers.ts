import * as A from "fp-ts/lib/Array";
import { pipe } from "fp-ts/lib/function";
import { not } from "fp-ts/lib/Predicate";
import * as RTE from "fp-ts/lib/ReaderTaskEither";
import * as TE from "fp-ts/lib/TaskEither";
import * as RA from "fp-ts/ReadonlyArray";
import { DepAskConfirmation } from "../../../deps-types";
import { err } from "../../../util/errors";
import { maxLength } from "../../../util/string";
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

const skipExisting: ConflictsSolver = (conflicts) => () =>
  pipe(
    conflicts,
    A.filter(isConflictExists),
    A.map(c => [c, "skip"] as const),
    TE.of,
  );

const overwriteExisting: ConflictsSolver = (conflicts) => () =>
  pipe(
    conflicts,
    A.filter(isConflictExists),
    A.map(c => [c, "overwrite"] as const),
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

const formatDate = (date: Date): string => {
  const year = date.getFullYear();
  const month = date.toLocaleString("default", { month: "short" });
  const day = date.getDate();
  const hours = date.getHours().toString().padStart(2, "0");
  const minutes = date.getMinutes().toString().padStart(2, "0");
  const seconds = date.getSeconds().toString().padStart(2, "0");

  return `${day} ${month} ${year} ${hours}:${minutes}:${seconds}`;
};

export const askConfirmationReplies = {
  yes: "yes",
  no: "no",
  noForAll: "no for all",
  yesForAll: "yes for all",
} as const;

export type AskConfirmationReplies = typeof askConfirmationReplies[keyof typeof askConfirmationReplies];

const askConflictExists =
  ({ askConfirmation }: DepAskConfirmation) => (c: ConflictExists): TE.TaskEither<Error, Solution> => {
    const localPath = c.localitem.path;
    const remotePath = c.mappedItem.downloadItem.path;

    const localSize = c.localitem.stats.size.toString();
    const remoteSize = c.mappedItem.downloadItem.item.size.toString();

    const remoteModified = formatDate(new Date(c.mappedItem.downloadItem.item.dateModified));
    const localModified = formatDate(new Date(c.localitem.stats.mtime));

    const maxPathLength = maxLength([localPath, remotePath]);
    const maxSizeLength = maxLength([localSize, remoteSize]);
    const maxModifiedLength = maxLength([localModified, remoteModified]);

    const message = ``
      + `overwrite? \n`
      + `local:  ${localPath.padEnd(maxPathLength + 2)}size: ${localSize.padEnd(maxSizeLength + 2)}modified: ${
        localModified.padEnd(maxModifiedLength + 2)
      }\n`
      + `remote: ${remotePath.padEnd(maxPathLength + 2)}size: ${remoteSize.padEnd(maxSizeLength + 2)}modified: ${
        remoteModified.padEnd(maxModifiedLength + 2)
      }`;

    return pipe(
      askConfirmation({
        message,
        options: Object.values(askConfirmationReplies),
      }),
      TE.map((decision): Solution =>
        decision === askConfirmationReplies.yes
          ? [c, "overwrite"]
          : decision === askConfirmationReplies.yesForAll
          ? [c, "overwrite"]
          : [c, "skip"]
      ),
    );
  };

const sameFileSizeAndDate = (c: ConflictExists) =>
  c.localitem.stats.size == c.mappedItem.downloadItem.item.size
  && c.localitem.stats.mtime.toString() == new Date(c.mappedItem.downloadItem.item.dateModified).toString();

/** Fails on ConflictStatsError. */
export const defaultSolver = (
  { skipSameSizeAndDate = false, skip, overwrite }: {
    /** If true, skips files that have the same size and date */
    skipSameSizeAndDate?: boolean;
    /** Skip without asking */
    skip: boolean;
    /** Overwrite without asking. Ignored if `skip` is true */
    overwrite: boolean;
  },
): ConflictsSolver<DepAskConfirmation> =>
(conflicts) =>
({ askConfirmation }) => {
  const statsConflicts = pipe(conflicts, A.filter(isConflictStatsError));
  let existsConflicts = pipe(conflicts, A.filter(isConflictExists));
  const solutions: Solution[] = [];

  if (statsConflicts.length > 0) {
    return TE.left(
      err(`Error getting stats for ${statsConflicts[0].mappedItem.localpath}: ${statsConflicts[0].error}`),
    );
  }

  if (skipSameSizeAndDate) {
    // add solutions
    solutions.push(
      ...pipe(
        existsConflicts,
        A.filter(sameFileSizeAndDate),
        A.map((conflict) => [conflict, "skip"] as const),
      ),
    );

    // exclude conflicts
    existsConflicts = pipe(
      existsConflicts,
      A.filter(not(sameFileSizeAndDate)),
    );
  }

  if (skip) {
    solutions.push(
      ...pipe(
        existsConflicts,
        A.map((conflict) => [conflict, "skip"] as const),
      ),
    );
    existsConflicts = [];
  } else if (overwrite) {
    solutions.push(
      ...pipe(
        existsConflicts,
        A.map((conflict) => [conflict, "overwrite"] as const),
      ),
    );
    existsConflicts = [];
  }

  // ask for solutions for the rest
  return pipe(
    existsConflicts,
    A.map(askConflictExists({ askConfirmation })),
    A.sequence(TE.ApplicativeSeq),
    TE.map(A.concat(solutions)),
  );
};

export const solvers = {
  defaultSolver,
  failOnConflicts,
  skipAll,
  skipExisting,
  overwriteExisting,
  overwriteAll,
  rename,
  overwriteIfSizeDifferent,
  askAll,
  askEvery,
};
