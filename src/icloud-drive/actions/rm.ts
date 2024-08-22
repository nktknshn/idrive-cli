import * as A from 'fp-ts/lib/Array'
import { pipe } from 'fp-ts/lib/function'
import * as SRTE from 'fp-ts/lib/StateReaderTaskEither'
import * as TE from 'fp-ts/TaskEither'
import { DepAskConfirmation } from '../../deps-types'
import { guardProp } from '../../util/guards'
import { NEA } from '../../util/types'
import { DriveLookup } from '..'
import { DepApiMethod, DriveApiMethods } from '../drive-api'
import { MoveItemToTrashResponse } from '../drive-requests'
import { DriveChildrenItemFile, isNotRootDetails, NonRootDetails } from '../drive-types'

export type Deps =
  & DriveLookup.Deps
  & DepApiMethod<'moveItemsToTrash'>
  & DepAskConfirmation

type Result = MoveItemToTrashResponse

export const rm = (
  globs: NEA<string>,
  { skipTrash = false, force = false, recursive = false }: {
    skipTrash: boolean
    recursive: boolean
    force: boolean
  },
): DriveLookup.Monad<Result, Deps> => {
  return pipe(
    DriveLookup.searchGlobs(globs, recursive ? Infinity : 1),
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
): DriveLookup.Monad<Result, Deps> => {
  const effect = () =>
    pipe(
      DriveApiMethods.moveItemsToTrash<DriveLookup.LookupState>({
        items: items.map(a => a.item),
        trash,
      }),
      SRTE.chainW(
        resp =>
          pipe(
            DriveLookup.removeByIdsFromCache(
              resp.items.map(_ => _.drivewsid),
            ),
            SRTE.map(() => resp),
          ),
      ),
    )

  return pipe(
    SRTE.ask<DriveLookup.LookupState, Deps>(),
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
