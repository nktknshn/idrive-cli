import * as A from "fp-ts/lib/Array";
import { pipe } from "fp-ts/lib/function";
import { getDirectoryStructure } from "../../../util/get-directory-structure";
import { guardProp } from "../../../util/guards";
import { DriveTree, Types } from "../..";

import { isMatchingAny } from "../../../util/glob-matching";
import { DownloadItem, DownloadTask } from "./types";

type IncludeExcludeFilter = (opts: {
  include: string[];
  exclude: string[];
}) => (file: DriveTree.WithItemPathValue<Types.Root>) => boolean;

export const filterByIncludeExcludeGlobs: IncludeExcludeFilter = ({ include, exclude }) =>
  ({ path }) =>
    (include.length == 0 || isMatchingAny(path, include, { dot: true }))
    && (exclude.length == 0 || !isMatchingAny(path, exclude, { dot: true }));

const filterFlatTree = ({ filterFiles }: {
  filterFiles: (files: { path: string; item: Types.DriveChildrenItemFile }) => boolean;
}) =>
  <T extends Types.Root>(flatTree: DriveTree.FlattenWithItems<T>) => {
    const files = pipe(
      flatTree,
      A.filter(guardProp("item", Types.isFile)),
    );

    const folders = pipe(
      flatTree,
      A.filter(guardProp("item", Types.isFolderLike)),
    );

    const { left: excluded, right: validFiles } = pipe(
      files,
      A.partition(filterFiles),
    );

    return {
      files: validFiles,
      folders,
      excluded,
    };
  };

/** Extracts the folders structure from the download items */
export const itemsFolderStructure = (items: DownloadItem[]) =>
  pipe(
    items,
    A.map(a => a.path),
    getDirectoryStructure,
  );

/** Applies the filter to the tree and returns a download task */
export const makeDownloadTaskFromTree = (opts: {
  filterFiles: (files: { path: string; item: Types.DriveChildrenItemFile }) => boolean;
}) =>
  <T extends Types.Root>(flatTree: DriveTree.FlattenWithItems<T>):
    & DownloadTask
    & { excluded: DownloadItem[] } =>
  {
    const { excluded, files /* folders */ } = filterFlatTree(opts)(flatTree);

    const { left: downloadable, right: empties } = pipe(
      files,
      A.partition(({ item }) => item.size == 0),
    );

    // const dirstruct = pipe(
    //   A.concat(downloadable)(empties),
    //   A.concatW(folders),
    //   A.map(a => a.path),
    //   getDirectoryStructure,
    // );

    return {
      // dirstruct,
      downloadable,
      empties,
      excluded,
    };
  };
