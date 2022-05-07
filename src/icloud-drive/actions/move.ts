import { pipe } from 'fp-ts/lib/function'
import * as NA from 'fp-ts/lib/NonEmptyArray'
import * as SRTE from 'fp-ts/lib/StateReaderTaskEither'
import { err } from '../../util/errors'
import { normalizePath } from '../../util/normalize-path'
import { parseFilename } from '../../util/parse-filename'
import { NEA } from '../../util/types'
import { DepDriveApi, DriveApi, DriveLookup } from '..'
import { MoveItemsResponse, RenameResponse } from '../drive-requests'
import * as T from '../icloud-drive-items-types'
import * as V from '../util/get-by-path-types'

export type Deps =
  & DriveLookup.Deps
  & DepDriveApi<'moveItems'>
  & DepDriveApi<'renameItems'>

/**
 * move a file or a directory
 */
export const move = ({ srcpath, dstpath }: {
  srcpath: string
  dstpath: string
}): DriveLookup.Action<Deps, MoveItemsResponse | RenameResponse> => {
  const nsrc = normalizePath(srcpath)
  const ndst = normalizePath(dstpath)

  return pipe(
    DriveLookup.getByPathsDocwsroot([nsrc, ndst]),
    SRTE.bindTo('srcdst'),
    SRTE.chain(handle),
    // SRTE.map((res) => `Statuses.: ${JSON.stringify(res.items.map(_ => _.status))}`),
  )
}

/*
  dstitem must be either
  - an existing folder. then we move src item into it
  - partially valid path with path equal to the path of src and a single rest. Then we rename the item
  - partially valid path with path *not* equal to the path of src and a singleton rest. Then we move the item into the path *and* rename the item
*/
const handle = (
  { srcdst: [srcitem, dstitem] }: {
    srcdst: NEA<V.PathValidation<T.DetailsDocwsRoot>>
  },
): DriveLookup.Action<Deps, MoveItemsResponse | RenameResponse> => {
  if (!srcitem.valid) {
    return DriveLookup.errS(`src item was not found: ${V.showGetByPathResult(srcitem)}`)
  }

  const src = V.pathTarget(srcitem)

  if (!T.isNotRootDetails(src)) {
    return DriveLookup.errS(`src cant be root`)
  }

  if (dstitem.valid) {
    const dst = V.pathTarget(dstitem)

    if (!T.isDetails(dst)) {
      return DriveLookup.errS(`dst is a file`)
    }

    return caseMove(src, dst)
  }

  if (
    V.eq().equals(dstitem.details, srcitem.details)
    && dstitem.rest.length == 1
  ) {
    const fname = NA.head(dstitem.rest)
    return caseRename(src, fname)
  }

  if (dstitem.rest.length == 1) {
    const dst = NA.last(dstitem.details)
    const fname = NA.head(dstitem.rest)

    return caseMoveAndRename(src, dst, fname)
  }

  return SRTE.left(err(`invalid dstitem`))
}

const caseMove = (
  src: T.NonRootDetails | T.DriveChildrenItemFile,
  dst: T.Details,
): DriveLookup.Action<Deps, MoveItemsResponse> => {
  return DriveApi.moveItems<DriveLookup.State>({
    destinationDrivewsId: dst.drivewsid,
    items: [{ drivewsid: src.drivewsid, etag: src.etag }],
  })
}

const caseRename = (
  srcitem: T.NonRootDetails | T.DriveChildrenItemFile,
  name: string,
): DriveLookup.Action<Deps, RenameResponse> => {
  return DriveApi.renameItems({
    items: [
      { drivewsid: srcitem.drivewsid, ...parseFilename(name), etag: srcitem.etag },
    ],
  })
}

const caseMoveAndRename = (
  src: T.NonRootDetails | T.DriveChildrenItemFile,
  dst: (T.Details | T.DetailsTrashRoot),
  name: string,
): DriveLookup.Action<Deps, RenameResponse> => {
  return pipe(
    DriveApi.moveItems<DriveLookup.State>(
      {
        destinationDrivewsId: dst.drivewsid,
        items: [{ drivewsid: src.drivewsid, etag: src.etag }],
      },
    ),
    SRTE.chainW(() =>
      DriveApi.renameItems({
        items: [
          { drivewsid: src.drivewsid, ...parseFilename(name), etag: src.etag },
        ],
      })
    ),
  )
}
