import * as A from 'fp-ts/lib/Array'
import { pipe } from 'fp-ts/lib/function'
import * as SRTE from 'fp-ts/lib/StateReaderTaskEither'
import * as TE from 'fp-ts/TaskEither'
import { guardProp } from '../../../../util/guards'
import { NEA } from '../../../../util/types'
import { DepAskConfirmation } from '../../../deps'
import { Dep, DepDriveApi, DriveApi, DriveQuery } from '../..'
import { MoveItemToTrashResponse } from '../../drive-api/requests'
import { DriveChildrenItemFile, isNotRootDetails, NonRootDetails } from '../../icloud-drive-types'

export type Deps =
  & DriveQuery.Deps
  & Dep<'moveItemsToTrash'>
  & DepAskConfirmation

type Result = MoveItemToTrashResponse

export const rm = (
  globs: NEA<string>,
  { skipTrash, force, recursive }: {
    skipTrash: boolean
    recursive: boolean
    force: boolean
  },
): DriveQuery.Action<Deps, Result> => {
  return pipe(
    DriveQuery.searchGlobs(globs, recursive ? Infinity : 1),
    SRTE.map(A.flatten),
    SRTE.map(
      A.filter(guardProp('item', isNotRootDetails)),
    ),
    SRTE.chainW((items) =>
      A.isNonEmpty(items)
        ? _rm({ items, trash: !skipTrash, force })
        : SRTE.of({ items: [] })
    ),
  )
}

const _rm = (
  { items, trash, force }: {
    trash: boolean
    force: boolean
    items: NEA<{ path: string; item: NonRootDetails | DriveChildrenItemFile }>
  },
): DriveQuery.Action<Deps, Result> => {
  const effect = () =>
    pipe(
      DriveApi.moveItemsToTrash<DriveQuery.State>({
        items: items.map(a => a.item),
        trash,
      }),
      SRTE.chainW(
        resp =>
          pipe(
            DriveQuery.removeByIdsFromCache(
              resp.items.map(_ => _.drivewsid),
            ),
            SRTE.map(() => resp),
          ),
      ),
    )

  return pipe(
    SRTE.ask<DriveQuery.State, Deps>(),
    SRTE.chainTaskEitherK(deps =>
      force
        ? TE.of(true)
        : deps.askConfirmation({
          message: `remove\n${pipe(items, A.map(a => a.path)).join('\n')}`,
        })
    ),
    SRTE.chain((answer) =>
      answer
        ? effect()
        : SRTE.of({ items: [] })
    ),
  )
}
