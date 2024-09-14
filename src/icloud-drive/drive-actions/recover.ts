import { pipe } from "fp-ts/lib/function";
import * as NA from "fp-ts/lib/NonEmptyArray";
import { not } from "fp-ts/lib/Refinement";
import * as SRTE from "fp-ts/lib/StateReaderTaskEither";
import { err } from "../../util/errors";
import { normalizePath } from "../../util/normalize-path";
import { DriveLookup } from "..";
import { DepApiMethod, DriveApiMethods } from "../drive-api";
import { PutBackItemsFromTrashResponse } from "../drive-requests";
import { isTrashDetailsG } from "../drive-types";

export type Deps =
  & DriveLookup.Deps
  & DepApiMethod<"putBackItemsFromTrash">;

export const recover = (
  { path }: { path: string },
): DriveLookup.Lookup<PutBackItemsFromTrashResponse, Deps> => {
  const npath = pipe(path, normalizePath);

  return pipe(
    DriveLookup.chainCachedTrash(trash => DriveLookup.getByPathsStrict(trash, [npath])),
    SRTE.map(NA.head),
    SRTE.filterOrElse(not(isTrashDetailsG), () => err(`you cannot recover trash root`)),
    SRTE.chainW((item) =>
      pipe(
        DriveApiMethods.putBackItemsFromTrash<DriveLookup.State>([item]),
      )
    ),
  );
};
