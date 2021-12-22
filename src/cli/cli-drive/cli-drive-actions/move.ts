import * as A from 'fp-ts/lib/Array'
import * as E from 'fp-ts/lib/Either'
import { constVoid, pipe } from 'fp-ts/lib/function'
import * as NA from 'fp-ts/lib/NonEmptyArray'
import * as SRTE from 'fp-ts/lib/StateReaderTaskEither'
import * as TE from 'fp-ts/lib/TaskEither'
import { fst } from 'fp-ts/lib/Tuple'
import * as V from '../../../icloud/drive/cache/GetByPathResultValid'
import { DriveApi } from '../../../icloud/drive/drive-api'
import { DetailsOrFile } from '../../../icloud/drive/drivef/lss'
import * as H from '../../../icloud/drive/drivef/validation'
import * as DF from '../../../icloud/drive/fdrive'
import { parseName } from '../../../icloud/drive/helpers'
import { MoveItemToTrashResponse } from '../../../icloud/drive/requests/moveItems'
import { RenameResponse } from '../../../icloud/drive/requests/rename'
import {
  Details,
  DetailsRoot,
  DetailsTrash,
  DriveChildrenItemFile,
  isDetails,
  isFolderLike,
  isNotRootDetails,
  RegularDetails,
} from '../../../icloud/drive/types'
import { err } from '../../../lib/errors'
import { NEA } from '../../../lib/types'
import { cliAction } from '../../cli-action'
import { Env } from '../../types'
import { normalizePath } from './helpers'

const caseMove = (
  src: RegularDetails | DriveChildrenItemFile,
  dst: Details,
): DF.DriveM<MoveItemToTrashResponse> => {
  return pipe(
    DF.readEnv,
    DF.chain(({ env }) =>
      pipe(
        env.api.moveItems(dst.drivewsid, [{ drivewsid: src.drivewsid, etag: src.etag }]),
        DF.fromTaskEither,
      )
    ),
  )
}

const caseRename = (
  srcitem: RegularDetails | DriveChildrenItemFile,
  name: string,
): DF.DriveM<RenameResponse> => {
  return pipe(
    DF.readEnv,
    DF.chain(({ env }) =>
      pipe(
        env.api.renameItems([
          { drivewsid: srcitem.drivewsid, ...parseName(name), etag: srcitem.etag },
        ]),
        DF.fromTaskEither,
      )
    ),
  )
}

const caseMoveAndRename = (
  src: RegularDetails | DriveChildrenItemFile,
  dst: (Details | DetailsTrash),
  name: string,
): DF.DriveM<RenameResponse> => {
  return pipe(
    DF.readEnv,
    DF.chain(({ env }) =>
      pipe(
        DF.fromTaskEither(
          env.api.moveItems(
            dst.drivewsid,
            [{ drivewsid: src.drivewsid, etag: src.etag }],
          ),
        ),
        DF.chain(() => {
          return DF.fromTaskEither(
            env.api.renameItems([
              { drivewsid: src.drivewsid, ...parseName(name), etag: src.etag },
            ]),
          )
        }),
      )
    ),
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
    srcdst: NEA<V.GetByPathResult<H.Hierarchy<DetailsRoot>>>
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

export const move = ({ sessionFile, cacheFile, srcpath, dstpath, noCache }: Env & {
  srcpath: string
  dstpath: string
}) => {
  return cliAction(
    { sessionFile, cacheFile, noCache },
    ({ cache, api }) => {
      const nsrc = normalizePath(srcpath)
      const ndst = normalizePath(dstpath)

      const res = pipe(
        DF.chainRoot(root =>
          pipe(
            DF.Do,
            SRTE.bind('srcdst', () => DF.lssPartial(root, [nsrc, ndst])),
            SRTE.chain(handle),
            DF.saveCacheFirst(cacheFile),
            DF.map(() => `Success.`),
          )
        ),
      )

      return pipe(res(cache)({ api }), TE.map(fst))
    },
  )
}
