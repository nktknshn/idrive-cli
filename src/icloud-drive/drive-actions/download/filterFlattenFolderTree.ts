import * as A from 'fp-ts/lib/Array'
import { pipe } from 'fp-ts/lib/function'
import micromatch from 'micromatch'
import { getDirectoryStructure } from '../../../util/get-directory-structure'
import { guardProp } from '../../../util/guards'
import { DriveTree, Types } from '../..'

import { DownloadItem, DownloadTask } from './types'

type DefaultFunc = (opts: {
  include: string[]
  exclude: string[]
}) => (file: DriveTree.FlattenWithItemsValue<Types.Root>) => boolean

export const filterByIncludeExcludeGlobs: DefaultFunc = ({ include, exclude }) =>
  ({ path }) =>
    (include.length == 0 || micromatch.any(path, include, { dot: true }))
    && (exclude.length == 0 || !micromatch.any(path, exclude, { dot: true }))

const filterFlatTree = ({ filterFiles }: {
  filterFiles: (files: { path: string; item: Types.DriveChildrenItemFile }) => boolean
}) =>
  <T extends Types.Root>(flatTree: DriveTree.FlattenWithItems<T>) => {
    const files = pipe(
      flatTree,
      A.filter(guardProp('item', Types.isFile)),
    )

    const folders = pipe(
      flatTree,
      A.filter(guardProp('item', Types.isFolderLike)),
    )

    const { left: excluded, right: validFiles } = pipe(
      files,
      A.partition(filterFiles),
    )

    return {
      files: validFiles,
      folders,
      excluded,
    }
  }

export const makeDownloadTaskFromTree = (opts: {
  filterFiles: (files: { path: string; item: Types.DriveChildrenItemFile }) => boolean
}) =>
  <T extends Types.Root>(flatTree: DriveTree.FlattenWithItems<T>): DownloadTask & {
    excluded: DownloadItem[]
  } => {
    const { excluded, files, folders } = filterFlatTree(opts)(flatTree)

    const { left: downloadable, right: empties } = pipe(
      files,
      A.partition(({ item }) => item.size == 0),
    )

    const dirstruct = pipe(
      A.concat(downloadable)(empties),
      A.concatW(folders),
      A.map(a => a.path),
      getDirectoryStructure,
    )

    return {
      dirstruct,
      downloadable,
      empties,
      excluded,
    }
  }
