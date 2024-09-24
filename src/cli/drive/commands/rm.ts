import * as A from "fp-ts/lib/Array";
import { pipe } from "fp-ts/lib/function";
import * as SRTE from "fp-ts/lib/StateReaderTaskEither";
import { DriveActions, DriveLookup } from "idrive-lib";

import { err } from "idrive-lib/util/errors";
import { includesGlobstar } from "idrive-lib/util/glob";
import { ensureSingleNewline } from "idrive-lib/util/string";

export const rm = (
  { paths, "skip-trash": skipTrash, force, recursive, dry, trash }: {
    paths: string[];
    "skip-trash": boolean;
    recursive: boolean;
    force: boolean;
    dry: boolean;
    trash: boolean;
  },
): DriveLookup.Lookup<string, DriveActions.DepsRm> => {
  if (!A.isNonEmpty(paths)) {
    return SRTE.left(err("No paths provided"));
  }

  if (includesGlobstar(paths) && !recursive) {
    return SRTE.left(err("globstar is not supported for non recursive rm"));
  }

  if (dry) {
    return pipe(
      DriveActions.rmCandidates(paths, { recursive, trash }),
      SRTE.map(A.map(_ => _.path)),
      SRTE.map(_ => _.join("\n")),
      SRTE.map(ensureSingleNewline),
    );
  }

  return pipe(
    DriveActions.rm(paths, { skipTrash, force, recursive, trash }),
    SRTE.map(({ items }) => `Removed ${items.length} items\n`),
  );
};
