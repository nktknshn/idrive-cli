import { pipe } from 'fp-ts/lib/function'
import * as NA from 'fp-ts/lib/NonEmptyArray'
import * as SRTE from 'fp-ts/lib/StateReaderTaskEither'
import { DriveApi, DriveLookup, T } from '../../../icloud-drive'
import { MoveItemsResponse, RenameResponse } from '../../../icloud-drive/drive-requests'
import * as V from '../../../icloud-drive/util/get-by-path-types'
import { err } from '../../../util/errors'
import { normalizePath } from '../../../util/normalize-path'
import { parseFilename } from '../../../util/parse-filename'
import { NEA } from '../../../util/types'

type Deps =
  & DriveLookup.Deps
  & DriveApi.Dep<'moveItems'>
  & DriveApi.Dep<'renameItems'>

/**
 * move a file or a directory
 */
export const move = ({ srcpath, dstpath }: {
  srcpath: string
  dstpath: string
}): DriveLookup.Effect<string, Deps> => {
  const nsrc = normalizePath(srcpath)
  const ndst = normalizePath(dstpath)

  return pipe(
    DriveLookup.chainCachedDocwsRoot(root => DriveLookup.getByPaths(root, [nsrc, ndst])),
    SRTE.bindTo('srcdst'),
    SRTE.chain(handle),
    SRTE.map((res) => `Statuses.: ${JSON.stringify(res.items.map(_ => _.status))}`),
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
    return DriveLookup.errString(`src item was not found: ${V.showGetByPathResult(srcitem)}`)
  }

  const src = V.pathTarget(srcitem)

  if (!T.isNotRootDetails(src)) {
    return DriveLookup.errString(`src cant be root`)
  }

  if (dstitem.valid === true) {
    const dst = V.pathTarget(dstitem)

    if (!T.isDetails(dst)) {
      return DriveLookup.errString(`dst is a file`)
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
  return DriveApi.moveItems<DriveLookup.LookupState>({
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
    DriveApi.moveItems<DriveLookup.LookupState>(
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
