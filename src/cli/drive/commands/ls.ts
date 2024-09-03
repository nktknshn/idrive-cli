import * as A from 'fp-ts/lib/Array'
import { pipe } from 'fp-ts/lib/function'
import * as NA from 'fp-ts/lib/NonEmptyArray'
import * as Ord from 'fp-ts/lib/Ord'
import * as SRTE from 'fp-ts/lib/StateReaderTaskEither'
import * as O from 'fp-ts/Option'
import { DriveActions, DriveLookup, DriveTree, GetByPath, Types } from '../../../icloud-drive'
import { ordDriveChildrenItemByName, ordDriveChildrenItemByType, ordIsFolder } from '../../../icloud-drive/drive-types'
import { addLeadingSlash } from '../../../util/normalize-path'
import { Path } from '../../../util/path'
import { addTrailingNewline } from '../../../util/string'

type Args = {
  paths: string[]
  fullPath: boolean
  long: number
  header: boolean
  trash: boolean
  tree: boolean
  // etag: boolean
  recursive: boolean
  depth: number
  cached: boolean
}

const showInvalidPath = (path: GetByPath.PathInvalid<Types.Root>) => {
  return GetByPath.showGetByPathResult(path)
}

type ShowDetailsInfoParams = {
  fullPath: boolean
  long: number
  header: boolean
}

// Aug 30 08:41
// Sep  2 19:14
// Sep  3  2023

const formatDate = (dateOrStr: Date | string) => {
  const date = typeof dateOrStr === 'string' ? new Date(dateOrStr) : dateOrStr

  const isCurrentYear = date.getFullYear() == new Date().getFullYear()

  if (isCurrentYear) {
    return [
      // month
      date.toDateString().slice(4, 7),
      // day
      date.toDateString().slice(8, 10).replace(/^0/, '').padStart(2),
      // time
      date.toTimeString().substring(0, 5),
    ].join(' ')
  }

  return [
    // month
    date.toDateString().slice(4, 7),
    // day
    date.toDateString().slice(8, 10).replace(/^0/, '').padStart(2),
    // year
    date.getFullYear().toString().padStart(5),
  ].join(' ')
}

const showItem = (
  item: Types.DriveChildrenItem,
  path: string,
  sizeWidth: number,
  { long, fullPath }: { long: number; fullPath: boolean },
): string => {
  let fname = fullPath
    ? Path.join(path, Types.fileName(item))
    : Types.fileName(item)

  if (item.type !== 'FILE') {
    fname += '/'
  }

  if (long == 0) {
    return fname
  }

  const col = (s: string, n = 20) => s.padEnd(n)

  if (long == 1 && item.type === 'FILE') {
    return ''
      + col(item.type, 14)
      + col(formatDate(item.dateCreated), 15)
      + item.size.toString().padStart(sizeWidth) + '   '
      + col(fname)
  }

  if (long == 1 && item.type !== 'FILE') {
    return ''
      + col(item.type, 14)
      + col(formatDate(item.dateCreated), 15)
      + col('', sizeWidth + 3)
      + col(fname)
  }

  return Types.fileName(item)
}

const showDetailsInfo = (details: Types.Details, path: string) =>
  (params: ShowDetailsInfoParams) => {
    let result = ''
    const column = (s: string) => s.padEnd(20)

    // process trash root separately
    if (Types.isTrashDetailsG(details)) {
      if (params.header) {
        result += `${column('Drivewsid')}${details.drivewsid}\n`
        result += `${column('Number of items')}${details.numberOfItems}\n`
        result += '\n'
      }
    }
    else {
      if (params.header) {
        result += `${column('Type')}${details.type}\n`
        result += `${column('Name')}${Types.fileName(details)}\n`
        if (details.extension !== undefined) {
          result += `${column('Extension')}${details.extension}\n`
        }
        result += `${column('Zone')}${details.zone}\n`
        result += `${column('Drivewsid')}${details.drivewsid}\n`
        result += `${column('Docwsid')}${details.docwsid}\n`
        result += `${column('Etag')}${details.etag}\n`
        if (!Types.isCloudDocsRootDetails(details)) {
          result += `${column('Parent ID')}${details.parentId}\n`
        }
        result += `${column('Number of items')}${details.numberOfItems}\n`
        result += `${column('Date created')}${details.dateCreated}\n`
        if (details.restorePath !== undefined) {
          result += `${column('Restore path')}${details.restorePath}\n`
        }
        result += '\n'
      }
    }

    const items = pipe(
      details.items,
      // APP_LIBRARY, FOLDER, FILE
      A.sortBy([Ord.reverse(ordIsFolder), ordDriveChildrenItemByType, ordDriveChildrenItemByName]),
    )

    const maxSize = pipe(
      items,
      A.filter(Types.isFile),
      A.map(_ => _.size),
      A.reduce(0, Math.max),
    )

    for (const item of items) {
      result += showItem(
        item,
        path,
        maxSize.toString().length + 2,
        { fullPath: params.fullPath, long: params.long },
      ) + '\n'
    }

    return result
  }

const showFileInfo = (item: Types.DriveChildrenItemFile) =>
  (params: ShowDetailsInfoParams) => {
    let result = ''
    const column = (s: string) => s.padEnd(20)

    if (params.header) {
      result += `${column('Type')}${item.type}\n`
      result += `${column('Full name')}${Types.fileName(item)}\n`
      if (item.extension !== undefined) {
        result += `${column('Extension')}${item.extension}\n`
      }
      result += `${column('Size')}${item.size}\n`
      result += `${column('Date created')}${item.dateCreated}\n`
      result += `${column('Date modified')}${item.dateModified}\n`
      result += `${column('Date changed')}${item.dateChanged}\n`
      result += `${column('Drivewsid')}${item.drivewsid}\n`
      result += `${column('Docwsid')}${item.docwsid}\n`
      result += `${column('Etag')}${item.etag}\n`
      result += `${column('Zone')}${item.zone}\n`
      result += `${column('Parent ID')}${item.parentId}\n`
      if (item.restorePath !== undefined) {
        result += `${column('Restore path')}${item.restorePath}\n`
      }
    }

    return result
  }

const showValidPath = (res: DriveActions.ListPathsFolder | DriveActions.ListPathsFile) => {
  if (res.isFile) {
    return showFileInfo(res.item)
  }
  return showDetailsInfo(
    { ...res.parentItem, items: res.items },
    GetByPath.pathString(res.validation),
  )
}

export const ls = (
  args: Args,
): DriveLookup.Lookup<string> => {
  if (!A.isNonEmpty(args.paths)) {
    return DriveLookup.errString('no paths')
  }

  args.paths = pipe(args.paths, A.map(addLeadingSlash))

  if (args.recursive && args.tree) {
    return lsRecursiveTree(args)
  }

  if (args.recursive) {
    return lsRecursive(args)
  }

  return lsShallow(args)
}

/** List a folder with zero depth */
const lsShallow = (
  args: Args,
): DriveLookup.Lookup<string> => {
  if (!A.isNonEmpty(args.paths)) {
    return DriveLookup.errString('no paths')
  }

  const opts = {
    showHeader: args.header,
    long: args.long,
    fullPath: args.fullPath,
  }

  return pipe(
    DriveActions.listPaths({ paths: args.paths, trash: args.trash, cached: args.cached }),
    SRTE.map(NA.map(a =>
      a.valid
        ? showValidPath(a)({ ...args, ...opts })
        : showInvalidPath(a.validation) + '\n'
    )),
    SRTE.map(NA.zip(args.paths)),
    SRTE.map(res =>
      res.length > 1
        ? pipe(res, NA.map(([res, path]) => `${path}:\n${res}`))
        : [res[0][0]]
    ),
    SRTE.map(_ => _.join('\n')),
    SRTE.map(addTrailingNewline),
  )
}

const lsRecursiveTree = (
  args: Args,
): DriveLookup.Lookup<string> => {
  if (!A.isNonEmpty(args.paths)) {
    return DriveLookup.errString('no paths')
  }

  return pipe(
    DriveActions.listRecursiveTree({ paths: args.paths, depth: args.depth }),
    SRTE.map(NA.zip(args.paths)),
    SRTE.map(NA.map(([tree, path]) =>
      pipe(
        tree,
        O.fold(
          () => Path.dirname(path) + '/',
          DriveTree.showTreeWithFiles,
        ),
      )
    )),
    SRTE.map(_ => _.join('\n\n')),
  )
}

const lsRecursive = (
  args: Args,
): DriveLookup.Lookup<string> => {
  if (!A.isNonEmpty(args.paths)) {
    return DriveLookup.errString('no paths')
  }

  return pipe(
    DriveActions.listRecursive({ paths: args.paths, depth: args.depth }),
    SRTE.map(NA.zip(args.paths)),
    SRTE.map(NA.map(([res, path]) => `${path}:\n${res.map(_ => _.path).join('\n')}`)),
    SRTE.map(_ => _.join('\n\n')),
  )
}
