import * as A from "fp-ts/lib/Array";
import { pipe } from "fp-ts/lib/function";
import * as SRTE from "fp-ts/lib/StateReaderTaskEither";
import { DriveLookup } from "../../../icloud-drive";

import * as Actions from "../../../icloud-drive/drive-actions";
import { err } from "../../../util/errors";
import { includesGlobstar } from "../../../util/glob-matching";
import { ensureSingleNewline } from "../../../util/string";

export const rm = (
  { paths, "skip-trash": skipTrash, force, recursive, dry, trash }: {
    paths: string[];
    "skip-trash": boolean;
    recursive: boolean;
    force: boolean;
    dry: boolean;
    trash: boolean;
  },
): DriveLookup.Lookup<string, Actions.DepsRm> => {
  if (!A.isNonEmpty(paths)) {
    return SRTE.left(err("No paths provided"));
  }

  if (includesGlobstar(paths) && !recursive) {
    return SRTE.left(err("globstar is not supported for non recursive rm"));
  }

  if (dry) {
    return pipe(
      Actions.rmCandidates(paths, { recursive, trash }),
      SRTE.map(A.map(_ => _.path)),
      SRTE.map(_ => _.join("\n")),
      SRTE.map(ensureSingleNewline),
    );
  }

  return pipe(
    Actions.rm(paths, { skipTrash, force, recursive, trash }),
    SRTE.map(({ items }) => `Removed ${items.length} items\n`),
  );
};
