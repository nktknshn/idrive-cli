import assert from 'assert'
import * as E from 'fp-ts/Either'
import * as A from 'fp-ts/lib/Array'
import { constVoid, pipe } from 'fp-ts/lib/function'
import * as NA from 'fp-ts/lib/NonEmptyArray'
import { not } from 'fp-ts/lib/Refinement'
import * as SRTE from 'fp-ts/lib/StateReaderTaskEither'
import micromatch from 'micromatch'
import { SchemaEnv } from '../../../icloud/drive/api/deps'
import * as API from '../../../icloud/drive/api/methods'
import { Dep } from '../../../icloud/drive/api/type'
import * as DF from '../../../icloud/drive/drive'
import { isCloudDocsRootDetailsG, isNotRootDetails, isTrashDetailsG } from '../../../icloud/drive/requests/types/types'
import { err } from '../../../lib/errors'
import { NEA, XXX } from '../../../lib/types'
import { normalizePath } from './helpers'
import { ask } from './upload'

type Deps = DF.DriveMEnv & Dep<'moveItemsToTrash'> & SchemaEnv

export const rma = (
  { paths, trash }: {
    paths: string[]
    trash: boolean
  },
): XXX<DF.State, Deps, string> => {
  assert(A.isNonEmpty(paths))

  const npaths = pipe(paths, NA.map(normalizePath))

  return pipe(
    SRTE.ask<DF.State, Deps>(),
    SRTE.bindTo('deps'),
    SRTE.bindW('items', () =>
      pipe(
        DF.chainRoot(root => DF.getByPaths(root, npaths)),
        SRTE.filterOrElse(not(A.some(isTrashDetailsG)), () => err(`you cannot remove root`)),
        SRTE.filterOrElse(not(A.some(isCloudDocsRootDetailsG)), () => err(`you cannot remove trash`)),
      )),
    SRTE.bindW('result', ({ items, deps }) =>
      pipe(
        API.moveItemsToTrash<DF.State>({ items, trash }),
        // SRTE.local(() => ({ moveItemsToTrash: deps.schema.moveItemsToTrash(deps.depsEnv) })),
        SRTE.chainW(
          resp => DF.removeByIds(resp.items.map(_ => _.drivewsid)),
        ),
      )),
    // SRTE.chain(() => DF.lsdir(parentPath)),
    SRTE.map(() => `Success.`),
    // SRTE.map(showDetailsInfo({
    //   fullPath: false,
    //   path: '',
    // })),
  )
}
export const rm = (
  { paths, trash }: {
    paths: string[]
    trash: boolean
  },
): XXX<DF.State, Deps, void> => {
  assert(A.isNonEmpty(paths))

  const scanned = pipe(
    paths,
    NA.map(micromatch.scan),
  )

  return pipe(
    SRTE.ask<DF.State, Deps>(),
    SRTE.bindTo('api'),
    SRTE.bindW('items', () =>
      pipe(
        DF.chainRoot(root => DF.searchGlobs(paths)),
        SRTE.map(A.flatten),
      )),
    SRTE.chainW(({ items }) =>
      items.length > 0
        ? pipe(
          ask({ message: `remove\n${pipe(items, A.map(a => a.path)).join('\n')}` }),
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
                  resp => DF.removeByIds(resp.items.map(_ => _.drivewsid)),
                ),
              )
              : SRTE.of(constVoid())
          ),
        )
        : SRTE.of(constVoid())
    ),
    // SRTE.chain(() => DF.lsdir(parentPath)),
    // SRTE.map((toberemoved) => toberemoved.map(_ => _.)),
    // SRTE.map(showDetailsInfo({
    //   fullPath: false,
    //   path: '',
    // })),
  )
}
