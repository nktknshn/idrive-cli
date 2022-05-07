import * as A from 'fp-ts/lib/Array'
import { pipe } from 'fp-ts/lib/function'
import micromatch from 'micromatch'
import { getDirectoryStructure } from '../../../../../util/getDirectoryStructure'
import { guardSnd } from '../../../../../util/guards'
import { T } from '../../..'
import { DownloadItem, DownloadTask } from './types'

type DefaultFunc = (opts: {
  include: string[]
  exclude: string[]
}) => (files: [string, T.DriveChildrenItemFile]) => boolean

const defaultFunc: DefaultFunc = ({ include, exclude }) =>
  ([path, item]) =>
    (include.length == 0 || micromatch.any(path, include, { dot: true }))
    && (exclude.length == 0 || !micromatch.any(path, exclude, { dot: true }))

const filterFlatTree = ({
  exclude,
  include,
  func = defaultFunc({ exclude, include }),
}: {
  include: string[]
  exclude: string[]
  func?: (files: [string, T.DriveChildrenItemFile]) => boolean
}) =>
  <T extends T.Details>(flatTree: [string, T.DetailsOrFile<T>][]) => {
    const files = pipe(
      flatTree,
      A.filter(guardSnd(T.isFile)),
    )

    const folders = pipe(
      flatTree,
      A.filter(guardSnd(T.isFolderLike)),
    )

    const { left: excluded, right: validFiles } = pipe(
      files,
      A.partition(func),
    )

    return {
      files: validFiles,
      folders,
      excluded,
    }
  }

export const filterFlattenFolderTree = (opts: {
  include: string[]
  exclude: string[]
  func?: (files: [string, T.DriveChildrenItemFile]) => boolean
}) =>
  <T extends T.Details>(flatTree: [string, T.DetailsOrFile<T>][]): DownloadTask & {
    excluded: DownloadItem[]
  } => {
    const { excluded, files, folders } = filterFlatTree(opts)(flatTree)

    const { left: downloadable, right: empties } = pipe(
      files,
      A.partition(([, file]) => file.size == 0),
    )

    const dirstruct = pipe(
      A.concat(downloadable)(empties),
      A.concatW(folders),
      A.map(a => a[0]),
      getDirectoryStructure,
    )

    return {
      dirstruct,
      downloadable,
      empties,
      excluded,
    }
  }
