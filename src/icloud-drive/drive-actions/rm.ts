import * as A from 'fp-ts/lib/Array'
import { pipe } from 'fp-ts/lib/function'
import * as NA from 'fp-ts/lib/NonEmptyArray'
import * as SRTE from 'fp-ts/lib/StateReaderTaskEither'
import * as TE from 'fp-ts/TaskEither'
import { DepAskConfirmation } from '../../deps-types'
import { loggerIO } from '../../logging'
import { guardProp } from '../../util/guards'
import { addLeadingSlash } from '../../util/normalize-path'
import { runLogging } from '../../util/srte-utils'
import { NEA } from '../../util/types'
import { DriveLookup } from '..'
import { DepApiMethod, DriveApiMethods } from '../drive-api'
import { MoveItemToTrashResponse } from '../drive-requests'
import { DriveChildrenItemFile, isNotRootDetails, NonRootDetails } from '../drive-types'

export type DepsRm =
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
): DriveLookup.Lookup<Result, DepsRm> => {
  const globsSlash = NA.map(addLeadingSlash)(globs)

  return pipe(
    DriveLookup.searchGlobs(globsSlash, recursive ? Infinity : 1),
    SRTE.map(A.flatten),
    SRTE.map(A.filter(guardProp('item', isNotRootDetails))),
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
): DriveLookup.Lookup<Result, DepsRm> => {
  const effect = () =>
    pipe(
      DriveApiMethods.moveItemsToTrash<DriveLookup.State>({
        items: items.map(a => a.item),
        trash,
      }),
      SRTE.chainFirstW(
        resp => DriveLookup.removeByIdsFromCache(resp.items.map(_ => _.drivewsid)),
      ),
      runLogging(loggerIO.debug(`removing ${items.length} items from cache`)),
    )

  return pipe(
    SRTE.ask<DriveLookup.State, DepsRm>(),
    SRTE.chainTaskEitherK(deps =>
      force
        ? TE.of(true)
        : deps.askConfirmation({
          message: `Remove?\n${pipe(items, A.map(a => a.path)).join('\n')}`,
        })
    ),
    SRTE.chain((answer) =>
      answer
        ? effect()
        : SRTE.of({ items: [] })
    ),
  )
}
