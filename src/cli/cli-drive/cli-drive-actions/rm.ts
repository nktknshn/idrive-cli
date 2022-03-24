import assert from 'assert'
import * as A from 'fp-ts/lib/Array'
import { constVoid, pipe } from 'fp-ts/lib/function'
import * as SRTE from 'fp-ts/lib/StateReaderTaskEither'
import { Api, DepApi, Drive } from '../../../icloud/drive'
import { isNotRootDetails } from '../../../icloud/drive/types'
import { askConfirmation } from './helpers'

type Deps = Drive.Deps & DepApi<'moveItemsToTrash'>

export const rm = (
  { paths, trash }: {
    paths: string[]
    trash: boolean
  },
): Drive.Effect<void, Deps> => {
  assert(A.isNonEmpty(paths))

  return pipe(
    Drive.searchGlobs(paths),
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
                Api.moveItemsToTrash<Drive.State>({
                  items: pipe(
                    items.map(a => a.item),
                    A.filter(isNotRootDetails),
                  ),
                  trash,
                }),
                SRTE.chainW(
                  resp => Drive.removeByIdsFromCache(resp.items.map(_ => _.drivewsid)),
                ),
              )
              : SRTE.of(constVoid())
          ),
        )
        : SRTE.of(constVoid())
    ),
  )
}
