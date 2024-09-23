import * as A from "fp-ts/lib/Array";
import { pipe } from "fp-ts/lib/function";
import * as TR from "fp-ts/lib/Tree";
import { getDirectoryStructure } from "../../../util/get-directory-structure";
import { isMatchingAny } from "../../../util/glob-matching";
import * as LT from "../../../util/localtree";
import { UploadFolderTask } from "./types";

export const makeUploadTaskFromTree = (
  { exclude, include }: { include: string[]; exclude: string[] },
) =>
(reltree: TR.Tree<LT.LocalTreeItem>): UploadFolderTask => {
  const flatTree = LT.flatten(reltree);

  const files = pipe(
    flatTree,
    A.filter((el): el is LT.FlattenTreeElement<LT.LocalFile> => el.type === "file"),
  );

  const { left: excluded, right: valid } = pipe(
    files,
    A.partition(
      (f) =>
        (include.length == 0 || isMatchingAny(f.path, include, { dot: true }))
        && (exclude.length == 0 || !isMatchingAny(f.path, exclude, { dot: true })),
    ),
  );

  const { left, right } = pipe(
    valid,
    A.partition((_) => _.stats.size == 0),
  );

  const uploadable = pipe(
    left,
    A.map(a => ({ remotepath: a.path, item: a })),
  );

  const empties = pipe(
    right,
    A.map(a => ({ remotepath: a.path, item: a })),
  );

  const dirstruct = pipe(
    A.concat(uploadable)(empties),
    A.map(a => a.remotepath),
    getDirectoryStructure,
  );

  return { dirstruct, uploadable, empties, excluded };
};
