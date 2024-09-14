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
import { listRecursive } from "./ls";

export type DepsRm =
  & DriveLookup.Deps
  & DepApiMethod<"moveItemsToTrash">
  & DepAskConfirmation;

type Result = MoveItemToTrashResponse;

export const rmCandidates = (
  globs: NEA<string>,
  { recursive = false, trash = false }: { recursive: boolean; trash: boolean },
) =>
  pipe(
    listRecursive({ globs, depth: recursive ? Infinity : 1, trash }),
    SRTE.map(A.flatten),
    SRTE.map(A.filter(guardProp("item", Types.isNotRootDetails))),
  );

export const rm = (
  globs: NEA<string>,
  { skipTrash = false, force = false, recursive = false, trash = false }: {
    skipTrash: boolean;
    recursive: boolean;
    force: boolean;
    trash: boolean;
  },
): DriveLookup.Lookup<Result, DepsRm> => {
  return pipe(
    rmCandidates(globs, { recursive, trash }),
    SRTE.chainW((items) =>
      A.isNonEmpty(items)
        ? _rm({ items, intoTrash: !skipTrash && !trash, force })
        : SRTE.of({ items: [] })
    ),
  );
};

const _rm = (
  { items, intoTrash, force }: {
    items: NEA<{
      path: string;
      item: Types.NonRootDetails | Types.DriveChildrenItemFile | Types.FolderLikeItem;
    }>;
    intoTrash: boolean;
    force: boolean;
  },
): DriveLookup.Lookup<Result, DepsRm> => {
  const effect = () =>
    pipe(
      DriveApiMethods.moveItemsToTrash<DriveLookup.State>({
        items: items.map(a => a.item),
        trash: intoTrash,
      }),
      runLogging(loggerIO.debug(`removing ${items.length} items`)),
      SRTE.chainFirstW(
        resp => DriveLookup.removeByIdsFromCache(resp.items.map(_ => _.drivewsid)),
      ),
    );

  const message = !intoTrash ? `Remove FOREVER (from trash or skipping trash)?` : `Remove to trash?`;

  return pipe(
    SRTE.ask<DriveLookup.State, DepsRm>(),
    SRTE.chainTaskEitherK(deps =>
      force
        ? TE.of(true)
        : deps.askConfirmation({
          message: `${message}\n${pipe(items, A.map(a => a.path)).join("\n")}`,
        })
    ),
    SRTE.chain((answer) =>
      answer
        ? effect()
        : SRTE.of({ items: [] })
    ),
  );
};
