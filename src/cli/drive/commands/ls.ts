import * as A from 'fp-ts/lib/Array'
import { pipe } from 'fp-ts/lib/function'
import * as NA from 'fp-ts/lib/NonEmptyArray'
import * as SRTE from 'fp-ts/lib/StateReaderTaskEither'
import { DriveActions, DriveLookup, GetByPath, Types } from '../../../icloud-drive'
import { showDetailsInfo, showFileInfo } from '../../../icloud-drive/actions/ls/ls-printing'

type Args = {
  paths: string[]
  fullPath: boolean
  listInfo: boolean
  header: boolean
  trash: boolean
  tree: boolean
  etag: boolean
  recursive: boolean
  depth: number
  cached: boolean
}

const showInvalidPath = (path: GetByPath.PathInvalid<Types.Root>) => {
  return GetByPath.showGetByPathResult(path)
}

const showValidPath = (res: DriveActions.ListPathsFolder | DriveActions.ListPathsFile) => {
  if (res.isFile) {
    return showFileInfo(res.item)
  }
  return showDetailsInfo({ ...res.item, items: res.items }, res.path)
}

export const listUnixPath = (
  args: Args,
): DriveLookup.Lookup<string> => {
  if (!A.isNonEmpty(args.paths)) {
    return DriveLookup.errString('no paths')
  }

  // if (args.recursive) {
  //   return DriveActions.lsRecursive({ paths: args.paths, depth: args.depth, tree: args.tree })
  // }

  // return Actions.lsShallow(paths)({
  //   fullPath,
  //   listInfo,
  //   trash,
  //   etag,
  //   cached,
  //   header,
  // })

  const opts = {
    showDocwsid: false,
    showDrivewsid: args.listInfo,
    showEtag: args.etag,
    showHeader: args.header,
  }

  return pipe(
    DriveActions.listPaths({ paths: args.paths, trash: args.trash, cached: args.cached }),
    SRTE.map(NA.map(a =>
      a.valid
        ? showValidPath(a)({ ...args, ...opts })
        : showInvalidPath(a.validation)
    )),
    SRTE.map(NA.zip(args.paths)),
    SRTE.map(NA.map(([res, path]) => `${path}:\n${res}`)),
    SRTE.map(_ => _.join('\n\n')),
  )
}
