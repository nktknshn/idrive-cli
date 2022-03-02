import { pipe } from 'fp-ts/lib/function'
import * as NA from 'fp-ts/lib/NonEmptyArray'
import * as SRTE from 'fp-ts/lib/StateReaderTaskEither'
import * as TE from 'fp-ts/lib/TaskEither'
import { fst } from 'fp-ts/lib/Tuple'
import { defaultApiEnv } from '../../../defaults'
import * as API from '../../../icloud/drive/api'
import { getById } from '../../../icloud/drive/cache/cache'
import * as V from '../../../icloud/drive/cache/cache-get-by-path-types'
import * as DF from '../../../icloud/drive/drive'
import * as H from '../../../icloud/drive/drive/validation'
import { parseName } from '../../../icloud/drive/helpers'
import { MoveItemToTrashResponse } from '../../../icloud/drive/requests'
import { RenameResponse } from '../../../icloud/drive/requests'
import { MoveItemsResponse } from '../../../icloud/drive/requests/moveItems'
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
    // SRTE.bind(
    //   'emy',
    //   () => DF.askCache(getById('FOLDER::com.apple.CloudDocs::EFDC48C5-5917-4A68-B11A-057F63EFD4C8')),
    // ),
    // DF.logS(({ emy }) => `${JSON.stringify(emy)}`),
    SRTE.bind(
      'srcdst',
      () => DF.chainRoot(root => DF.getByPathsH(root, [nsrc, ndst])),
    ),
    DF.chain(handle),
    DF.map((res) => `Statuses.: ${JSON.stringify(res.items.map(_ => _.status))}`),
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
): DF.DriveM<MoveItemsResponse | RenameResponse> => {
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

const caseMove = (
  src: NonRootDetails | DriveChildrenItemFile,
  dst: Details,
): DF.DriveM<MoveItemsResponse> => {
  return pipe(
    API.moveItems({
      destinationDrivewsId: dst.drivewsid,
      items: [{ drivewsid: src.drivewsid, etag: src.etag }],
    }),
  )
}

const caseRename = (
  srcitem: NonRootDetails | DriveChildrenItemFile,
  name: string,
): DF.DriveM<RenameResponse> => {
  return pipe(
    API.renameItems({
      items: [
        { drivewsid: srcitem.drivewsid, ...parseName(name), etag: srcitem.etag },
      ],
    }),
    // DF.fromApiRequest,
  )
}

const caseMoveAndRename = (
  src: NonRootDetails | DriveChildrenItemFile,
  dst: (Details | DetailsTrash),
  name: string,
): DF.DriveM<RenameResponse> => {
  return pipe(
    API.moveItems<DF.DriveMState>(
      {
        destinationDrivewsId: dst.drivewsid,
        items: [{ drivewsid: src.drivewsid, etag: src.etag }],
      },
    ),
    DF.chain(() =>
      API.renameItems({
        items: [
          { drivewsid: src.drivewsid, ...parseName(name), etag: src.etag },
        ],
      })
    ),
  )
}
