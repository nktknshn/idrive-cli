import assert from 'assert'
import * as A from 'fp-ts/lib/Array'
import { constVoid, pipe } from 'fp-ts/lib/function'
import * as SRTE from 'fp-ts/lib/StateReaderTaskEither'
import * as API from '../../../icloud/drive/api/drive-api-methods'
import { Dep } from '../../../icloud/drive/api/type'
import * as DF from '../../../icloud/drive/drive'
import { isNotRootDetails } from '../../../icloud/drive/requests/types/types'
import { XXX } from '../../../lib/types'
import { askConfirmation } from './helpers'

type Deps = DF.DriveMEnv & Dep<'moveItemsToTrash'>

export const rm = (
  { paths, trash }: {
    paths: string[]
    trash: boolean
  },
): XXX<DF.State, Deps, void> => {
  assert(A.isNonEmpty(paths))

  return pipe(
    DF.searchGlobs(paths),
    SRTE.map(A.flatten),
    SRTE.chainW((items) =>
      items.length > 0
        ? pipe(
          askConfirmation({
            message: `remove\n${pipe(items, A.map(a => a.path)).join('\n')}`,
          }),
          SRTE.fromTaskEither,
          SRTE.chain((answer) =>
            answer
              ? pipe(
                API.moveItemsToTrash<DF.State>({
                  items: pipe(
                    items.map(a => a.item),
                    A.filter(isNotRootDetails),
                  ),
                  trash,
                }),
                SRTE.chainW(
                  resp => DF.cacheRemoveByIds(resp.items.map(_ => _.drivewsid)),
                ),
              )
              : SRTE.of(constVoid())
          ),
        )
        : SRTE.of(constVoid())
    ),
  )
}
