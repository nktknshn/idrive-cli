import * as A from "fp-ts/lib/Array";
import { pipe } from "fp-ts/lib/function";
import * as SRTE from "fp-ts/lib/StateReaderTaskEither";
import * as TE from "fp-ts/TaskEither";

import { DepAskConfirmation } from "../../deps-types";
import { loggerIO } from "../../logging";
import { guardProp } from "../../util/guards";
import { runLogging } from "../../util/srte-utils";
import { NEA } from "../../util/types";
import { DriveLookup, Types } from "..";
import { DepApiMethod, DriveApiMethods } from "../drive-api";
import { MoveItemToTrashResponse } from "../drive-requests";
import { listRecursive, listShallow } from "./ls";

export type DepsRm =
  & DriveLookup.Deps
  & DepApiMethod<"moveItemsToTrash">
  & DepAskConfirmation;

type Result = MoveItemToTrashResponse;

export const rmCandidates = (
  globs: NEA<string>,
  { recursive = false }: { recursive: boolean },
) =>
  pipe(
    listRecursive({ globs, depth: recursive ? Infinity : 1, trash: false }),
    SRTE.map(A.flatten),
    SRTE.map(A.filter(guardProp("item", Types.isNotRootDetails))),
  );

export const rmCandidatesTrash = (
  globs: NEA<string>,
) =>
  pipe(
    listShallow({ paths: globs, trash: true }),
  );

export const rmTrash = (
  globs: NEA<string>,
) =>
  pipe(
    rmCandidatesTrash(globs),
    // SRTE.chainW((items) =>
    //   A.isNonEmpty(items)
    //     ? _rm({ items, trash: true, force: false })
    //     : SRTE.of({ items: [] })
    // ),
  );

export const rm = (
  globs: NEA<string>,
  { skipTrash = false, force = false, recursive = false }: {
    skipTrash: boolean;
    recursive: boolean;
    force: boolean;
  },
): DriveLookup.Lookup<Result, DepsRm> => {
  return pipe(
    rmCandidates(globs, { recursive }),
    SRTE.chainW((items) =>
      A.isNonEmpty(items)
        ? _rm({ items, trash: !skipTrash, force })
        : SRTE.of({ items: [] })
    ),
  );
};

const _rm = (
  { items, trash, force }: {
    items: NEA<{
      path: string;
      item: Types.NonRootDetails | Types.DriveChildrenItemFile | Types.FolderLikeItem;
    }>;
    trash: boolean;
    force: boolean;
  },
): DriveLookup.Lookup<Result, DepsRm> => {
  const effect = () =>
    pipe(
      DriveApiMethods.moveItemsToTrash<DriveLookup.State>({
        items: items.map(a => a.item),
        trash,
      }),
      runLogging(loggerIO.debug(`removing ${items.length} items`)),
      SRTE.chainFirstW(
        resp => DriveLookup.removeByIdsFromCache(resp.items.map(_ => _.drivewsid)),
      ),
    );

  return pipe(
    SRTE.ask<DriveLookup.State, DepsRm>(),
    SRTE.chainTaskEitherK(deps =>
      force
        ? TE.of(true)
        : deps.askConfirmation({
          message: `Remove?\n${pipe(items, A.map(a => a.path)).join("\n")}`,
        })
    ),
    SRTE.chain((answer) =>
      answer
        ? effect()
        : SRTE.of({ items: [] })
    ),
  );
};
