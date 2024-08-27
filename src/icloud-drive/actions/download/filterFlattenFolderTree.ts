import * as A from 'fp-ts/lib/Array'
import { pipe } from 'fp-ts/lib/function'
import micromatch from 'micromatch'
import { getDirectoryStructure } from '../../../util/get-directory-structure'
import { guardProp, guardSnd } from '../../../util/guards'
import { Types } from '../..'
import { FlattenFolderTreeWPath, FlattenTreeItemP, RemoteFile } from '../../util/drive-folder-tree'
import { DownloadItem, DownloadTask } from './types'

type DefaultFunc = (opts: {
  include: string[]
  exclude: string[]
}) => (file: FlattenTreeItemP<Types.Root>) => boolean

export const filterByIncludeExcludeGlobs: DefaultFunc = ({ include, exclude }) =>
  ({ remotefile, remotepath }) =>
    (include.length == 0 || micromatch.any(remotepath, include, { dot: true }))
    && (exclude.length == 0 || !micromatch.any(remotepath, exclude, { dot: true }))

const filterFlatTree = ({ filterFiles }: {
  filterFiles: (files: RemoteFile) => boolean
}) =>
  <T extends Types.Root>(flatTree: FlattenFolderTreeWPath<T>) => {
    const files = pipe(
      flatTree,
      A.filter(guardProp('remotefile', Types.isFile)),
    )

    const folders = pipe(
      flatTree,
      A.filter(guardProp('remotefile', Types.isFolderLike)),
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
  filterFiles: (files: RemoteFile) => boolean
}) =>
  <T extends Types.Root>(flatTree: FlattenFolderTreeWPath<T>): DownloadTask & {
    excluded: DownloadItem[]
  } => {
    const { excluded, files, folders } = filterFlatTree(opts)(flatTree)

    const { left: downloadable, right: empties } = pipe(
      files,
      A.partition(({ remotefile }) => remotefile.size == 0),
    )

    const dirstruct = pipe(
      A.concat(downloadable)(empties),
      A.concatW(folders),
      A.map(a => a.remotepath),
      getDirectoryStructure,
    )

    return {
      dirstruct,
      downloadable,
      empties,
      excluded,
    }
  }
