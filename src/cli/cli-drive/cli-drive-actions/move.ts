import { pipe } from 'fp-ts/lib/function'
import * as NA from 'fp-ts/lib/NonEmptyArray'
import * as SRTE from 'fp-ts/lib/StateReaderTaskEither'
import * as NM from '../../../icloud/drive/api/methods'
import { Use } from '../../../icloud/drive/api/type'
import * as V from '../../../icloud/drive/cache/cache-get-by-path-types'
import * as DF from '../../../icloud/drive/drive'
import * as H from '../../../icloud/drive/drive/validation'
import { parseName } from '../../../icloud/drive/helpers'
import { RenameResponse } from '../../../icloud/drive/requests'
import { MoveItemsResponse } from '../../../icloud/drive/requests/moveItems'
import * as T from '../../../icloud/drive/requests/types/types'
import { err } from '../../../lib/errors'
import { NEA, XXX } from '../../../lib/types'
import { normalizePath } from './helpers'

type Deps = DF.DriveMEnv & Use<'moveItemsM'> & Use<'renameItemsM'>

/**
 * move a file or a directory
 */
export const move = ({ srcpath, dstpath }: {
  srcpath: string
  dstpath: string
}): XXX<DF.State, Deps, string> => {
  const nsrc = normalizePath(srcpath)
  const ndst = normalizePath(dstpath)

  return pipe(
    DF.Do,
    SRTE.bind(
      'srcdst',
      () => DF.chainRoot(root => DF.getByPathsH(root, [nsrc, ndst])),
    ),
    SRTE.chain(handle),
    SRTE.map((res) => `Statuses.: ${JSON.stringify(res.items.map(_ => _.status))}`),
  )
}

/*
  dstitem must be either
  - an existing folder. then we move src item into it
  - partially valid path with path equal to the path of src and a singleton rest. Then we rename the item
  - partially valid path with path *not* equal to the path of src and a singleton rest. Then we move the item into the path *and* rename the item
*/
const handle = (
  { srcdst: [srcitem, dstitem] }: {
    srcdst: NEA<V.PathValidation<H.Hierarchy<T.DetailsDocwsRoot>>>
  },
): XXX<DF.State, Deps, MoveItemsResponse | RenameResponse> => {
  if (!srcitem.valid) {
    return DF.errS(`src item was not found: ${V.showGetByPathResult(srcitem)}`)
  }

  const src = V.target(srcitem)

  if (!T.isNotRootDetails(src)) {
    return DF.errS(`src cant be root`)
  }

  if (dstitem.valid) {
    const dst = V.target(dstitem)

    if (!T.isDetails(dst)) {
      return DF.errS(`dst is a file`)
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

  return DF.left(err(`invalid dstitem`))
}

const caseMove = (
  src: T.NonRootDetails | T.DriveChildrenItemFile,
  dst: T.Details,
): XXX<DF.State, Deps, MoveItemsResponse> => {
  return pipe(
    SRTE.ask<DF.State, Deps>(),
    SRTE.chainW(({ moveItemsM }) =>
      moveItemsM({
        destinationDrivewsId: dst.drivewsid,
        items: [{ drivewsid: src.drivewsid, etag: src.etag }],
      })
    ),
  )
}

const caseRename = (
  srcitem: T.NonRootDetails | T.DriveChildrenItemFile,
  name: string,
): XXX<DF.State, Deps, RenameResponse> => {
  return pipe(
    NM.renameItems({
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
): XXX<DF.State, Deps, RenameResponse> => {
  // return pipe(
  //   API.moveItems<DF.DriveMState>(
  //     {
  //       destinationDrivewsId: dst.drivewsid,
  //       items: [{ drivewsid: src.drivewsid, etag: src.etag }],
  //     },
  //   ),
  //   DF.chain(() =>
  //     API.renameItems({
  //       items: [
  //         { drivewsid: src.drivewsid, ...parseName(name), etag: src.etag },
  //       ],
  //     })
  //   ),
  // )

  return pipe(
    SRTE.ask<DF.State, Deps>(),
    SRTE.chainW(({ renameItemsM, moveItemsM }) =>
      pipe(
        moveItemsM<DF.State>(
          {
            destinationDrivewsId: dst.drivewsid,
            items: [{ drivewsid: src.drivewsid, etag: src.etag }],
          },
        ),
        SRTE.chain(() =>
          NM.renameItems({
            items: [
              { drivewsid: src.drivewsid, ...parseName(name), etag: src.etag },
            ],
          })
        ),
      )
    ),
  )
}
