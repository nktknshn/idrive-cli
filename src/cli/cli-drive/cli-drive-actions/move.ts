import { pipe } from 'fp-ts/lib/function'
import * as NA from 'fp-ts/lib/NonEmptyArray'
import * as SRTE from 'fp-ts/lib/StateReaderTaskEither'
import { Api, Drive } from '../../../icloud/drive'
import * as V from '../../../icloud/drive/cache/cache-get-by-path-types'
import { DepApi } from '../../../icloud/drive/deps/deps'
import { parseName } from '../../../icloud/drive/helpers'
import { MoveItemsResponse, RenameResponse } from '../../../icloud/drive/requests'
import * as T from '../../../icloud/drive/types'
import { err } from '../../../lib/errors'
import { normalizePath } from '../../../lib/normalize-path'
import * as H from '../../../lib/path-validation'
import { NEA } from '../../../lib/types'

type Deps =
  & Drive.Deps
  & DepApi<'moveItems'>
  & DepApi<'renameItems'>

/**
 * move a file or a directory
 */
export const move = ({ srcpath, dstpath }: {
  srcpath: string
  dstpath: string
}): Drive.Effect<string, Deps> => {
  const nsrc = normalizePath(srcpath)
  const ndst = normalizePath(dstpath)

  return pipe(
    Drive.chainCachedDocwsRoot(root => Drive.getByPaths(root, [nsrc, ndst])),
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
    srcdst: NEA<V.PathValidation<H.Hierarchy<T.DetailsDocwsRoot>>>
  },
): Drive.Action<Deps, MoveItemsResponse | RenameResponse> => {
  if (!srcitem.valid) {
    return Drive.errS(`src item was not found: ${V.showGetByPathResult(srcitem)}`)
  }

  const src = V.target(srcitem)

  if (!T.isNotRootDetails(src)) {
    return Drive.errS(`src cant be root`)
  }

  if (dstitem.valid) {
    const dst = V.target(dstitem)

    if (!T.isDetails(dst)) {
      return Drive.errS(`dst is a file`)
    }

    return caseMove(src, dst)
  }

  if (
    H.eq().equals(dstitem.path.details, srcitem.path.details)
    && dstitem.path.rest.length == 1
  ) {
    const fname = NA.head(dstitem.path.rest)
    return caseRename(src, fname)
  }

  if (dstitem.path.rest.length == 1) {
    const dst = NA.last(dstitem.path.details)
    const fname = NA.head(dstitem.path.rest)

    return caseMoveAndRename(src, dst, fname)
  }

  return SRTE.left(err(`invalid dstitem`))
}

const caseMove = (
  src: T.NonRootDetails | T.DriveChildrenItemFile,
  dst: T.Details,
): Drive.Action<Deps, MoveItemsResponse> => {
  return Api.moveItems({
    destinationDrivewsId: dst.drivewsid,
    items: [{ drivewsid: src.drivewsid, etag: src.etag }],
  })
}

const caseRename = (
  srcitem: T.NonRootDetails | T.DriveChildrenItemFile,
  name: string,
): Drive.Action<Deps, RenameResponse> => {
  return pipe(
    Api.renameItems({
      items: [
        { drivewsid: srcitem.drivewsid, ...parseName(name), etag: srcitem.etag },
      ],
    }),
  )
}

const caseMoveAndRename = (
  src: T.NonRootDetails | T.DriveChildrenItemFile,
  dst: (T.Details | T.DetailsTrash),
  name: string,
): Drive.Action<Deps, RenameResponse> => {
  return pipe(
    Api.moveItems<Drive.State>(
      {
        destinationDrivewsId: dst.drivewsid,
        items: [{ drivewsid: src.drivewsid, etag: src.etag }],
      },
    ),
    SRTE.chainW(() =>
      Api.renameItems({
        items: [
          { drivewsid: src.drivewsid, ...parseName(name), etag: src.etag },
        ],
      })
    ),
  )
}
