import * as A from "fp-ts/Array";
import { pipe } from "fp-ts/lib/function";
import * as TR from "fp-ts/lib/Tree";
import { FsStats } from "./fs";

export type LocalTree = TR.Tree<LocalTreeItem>;

export type LocalFile = {
  readonly type: "file";
  path: string;
  name: string;
  stats: FsStats;
};

export type LocalDirectory = {
  readonly type: "directory";
  path: string;
  name: string;
  stats: FsStats;
};

export type LocalTreeItem = LocalFile | LocalDirectory;

export type FlattenTreeElement<T extends LocalTreeItem = LocalTreeItem> = T;

export const flatten = (
  reltree: LocalTree,
): FlattenTreeElement[] =>
  pipe(
    reltree,
    TR.reduce(
      [] as FlattenTreeElement[],
      (acc, item) => A.append(item)(acc),
    ),
  );
