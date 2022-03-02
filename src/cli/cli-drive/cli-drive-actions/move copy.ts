import { identity, pipe } from 'fp-ts/lib/function'
import * as NA from 'fp-ts/lib/NonEmptyArray'
import * as RTE from 'fp-ts/lib/ReaderTaskEither'
import * as SRTE from 'fp-ts/lib/StateReaderTaskEither'
import * as TE from 'fp-ts/lib/TaskEither'
import { fst } from 'fp-ts/lib/Tuple'
import { defaultApiEnv } from '../../../defaults'
import { AuthorizedState } from '../../../icloud/authorization/authorize'
import * as AM from '../../../icloud/drive/api'
import * as V from '../../../icloud/drive/cache/cache-get-by-path-types'
import * as DF from '../../../icloud/drive/drive copy'
import * as H from '../../../icloud/drive/drive/validation'
import { parseName } from '../../../icloud/drive/helpers'
import * as RQ from '../../../icloud/drive/requests'
import { MoveItemToTrashResponse } from '../../../icloud/drive/requests'
import { RenameResponse } from '../../../icloud/drive/requests'
import * as AR from '../../../icloud/drive/requests/request'
import {
  Details,
  DetailsDocwsRoot,
  DetailsTrash,
  DriveChildrenItemFile,
  isDetails,
  isNotRootDetails,
  NonRootDetails,
} from '../../../icloud/drive/requests/types/types'
import { err } from '../../../lib/errors'
import { NEA } from '../../../lib/types'
import { cliActionM2 } from '../../cli-action'
import { Env } from '../../types'
import { normalizePath } from './helpers'

/**
 * move a file or a directory
 */
export const move = ({ srcpath, dstpath }: {
  srcpath: string
  dstpath: string
}) => {
  const nsrc = normalizePath(srcpath)
  const ndst = normalizePath(dstpath)

  return pipe(
    DF.Do,
    SRTE.bindW('api', () => SRTE.fromReader((api: CapMoveItems<DF.DriveMState>) => api)),
    SRTE.bindW(
      'srcdst',
      () =>
        pipe(
          DF.chainRoot(root => DF.lssPartial(root, [nsrc, ndst])),
          // SRTE.flattenW,
        ),
    ),
    // SRTE.chainW(handle),
  ) // RTE.Do,
  // RTE.ask<DF.DriveMState>(),
  // RTE.bindW('api', () => (api: CapMoveItems<DF.DriveMState>) => TE.of(api)),
  // RTE.bindW('srcdst', DF.chainRoot(root => DF.lssPartial(root, [nsrc, ndst]))),
  // RTE.map(_ => _.),
  // RTE.chainW(handle),
}

/*
  dstitem must be either
  - an existing folder. then we move src item into it
  - partially valid path with path equal to the path of src and a singleton rest. Then we rename the item
  - partially valid path with path *not* equal to the path of src and a singleton rest. Then we move the item into the path *and* rename the item
*/
const handle = (
  { srcdst: [srcitem, dstitem], api }: {
    srcdst: NEA<V.PathValidation<H.Hierarchy<DetailsDocwsRoot>>>
    api: CapMoveItems<DF.DriveMState>
  },
) => {
  // : DF.DriveM<MoveItemToTrashResponse | RenameResponse> =>
  if (!srcitem.valid) {
    return DF.errS(`src item was not found: ${V.showGetByPathResult(srcitem)}`)
  }

  const src = V.target(srcitem)

  if (!isNotRootDetails(src)) {
    return DF.errS(`src cant be root`)
  }

  if (dstitem.valid) {
    const dst = V.target(dstitem)

    if (!isDetails(dst)) {
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

type CapMoveItems<S extends AuthorizedState> = {
  moveItemsM: ({ items, destinationDrivewsId }: {
    destinationDrivewsId: string
    items: {
      drivewsid: string
      etag: string
    }[]
  }) => AR.AuthorizedRequest<MoveItemToTrashResponse, S, AR.RequestEnv>
}

const caseMove = (
  src: NonRootDetails | DriveChildrenItemFile,
  dst: Details,
) => {
  return pipe(
    RTE.ask<CapMoveItems<DF.DriveMState>>(),
    RTE.map(({ moveItemsM }) =>
      moveItemsM({
        destinationDrivewsId: dst.drivewsid,
        items: [{ drivewsid: src.drivewsid, etag: src.etag }],
      })
    ),
    // SRTE.fromReaderTaskEither,
    // SRTE.chainW(v => v),
  )
}

const caseRename = (
  srcitem: NonRootDetails | DriveChildrenItemFile,
  name: string,
) => {
  return pipe(
    RQ.renameItemsM({
      items: [
        { drivewsid: srcitem.drivewsid, ...parseName(name), etag: srcitem.etag },
      ],
    }),
  )
}

const caseMoveAndRename = (
  src: NonRootDetails | DriveChildrenItemFile,
  dst: (Details | DetailsTrash),
  name: string,
) => {
  return pipe(
    RQ.moveItemsM(
      {
        destinationDrivewsId: dst.drivewsid,
        items: [{ drivewsid: src.drivewsid, etag: src.etag }],
      },
    ),
    AR.chain(() => {
      return RQ.renameItemsM({
        items: [
          { drivewsid: src.drivewsid, ...parseName(name), etag: src.etag },
        ],
      })
    }),
  )
}
