import { pipe } from 'fp-ts/lib/function'
import * as NA from 'fp-ts/lib/NonEmptyArray'
import * as SRTE from 'fp-ts/lib/StateReaderTaskEither'
import * as TE from 'fp-ts/lib/TaskEither'
import { fst } from 'fp-ts/lib/Tuple'
import { defaultApiEnv } from '../../../defaults'
import * as AM from '../../../icloud/drive/api'
import * as V from '../../../icloud/drive/cache/cache-get-by-path-types'
import * as DF from '../../../icloud/drive/ffdrive'
import { cliActionM2 } from '../../../icloud/drive/ffdrive/cli-action'
import * as H from '../../../icloud/drive/ffdrive/validation'
import { parseName } from '../../../icloud/drive/helpers'
import { MoveItemToTrashResponse } from '../../../icloud/drive/requests'
import { RenameResponse } from '../../../icloud/drive/requests'
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
import { Env } from '../../types'
import { normalizePath } from './helpers'

/**
 * move a file or a directory
 */
export const move = ({ sessionFile, cacheFile, srcpath, dstpath, noCache }: Env & {
  srcpath: string
  dstpath: string
}) => {
  return pipe(
    { sessionFile, cacheFile, noCache, ...defaultApiEnv },
    cliActionM2(() => {
      const nsrc = normalizePath(srcpath)
      const ndst = normalizePath(dstpath)

      return DF.chainRoot(root =>
        pipe(
          DF.Do,
          SRTE.bind('srcdst', () => DF.lssPartial(root, [nsrc, ndst])),
          DF.chain(handle),
          DF.saveCacheFirst(cacheFile),
          DF.map(() => `Success.`),
        )
      )
    }),
  )
}

const caseMove = (
  src: NonRootDetails | DriveChildrenItemFile,
  dst: Details,
): DF.DriveM<MoveItemToTrashResponse> => {
  return pipe(
    AM.moveItems({
      destinationDrivewsId: dst.drivewsid,
      items: [{ drivewsid: src.drivewsid, etag: src.etag }],
    }),
    DF.fromApiRequest,
  )
}

const caseRename = (
  srcitem: NonRootDetails | DriveChildrenItemFile,
  name: string,
): DF.DriveM<RenameResponse> => {
  return pipe(
    AM.renameItems({
      items: [
        { drivewsid: srcitem.drivewsid, ...parseName(name), etag: srcitem.etag },
      ],
    }),
    DF.fromApiRequest,
  )
}

const caseMoveAndRename = (
  src: NonRootDetails | DriveChildrenItemFile,
  dst: (Details | DetailsTrash),
  name: string,
): DF.DriveM<RenameResponse> => {
  return pipe(
    DF.fromApiRequest(
      AM.moveItems(
        {
          destinationDrivewsId: dst.drivewsid,
          items: [{ drivewsid: src.drivewsid, etag: src.etag }],
        },
      ),
    ),
    DF.chain(() => {
      return DF.fromApiRequest(
        AM.renameItems({
          items: [
            { drivewsid: src.drivewsid, ...parseName(name), etag: src.etag },
          ],
        }),
      )
    }),
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
    srcdst: NEA<V.PathValidation<H.Hierarchy<DetailsDocwsRoot>>>
  },
): DF.DriveM<MoveItemToTrashResponse | RenameResponse> => {
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
