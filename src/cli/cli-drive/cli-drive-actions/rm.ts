import assert from 'assert'
import * as A from 'fp-ts/lib/Array'
import { constVoid, flow, pipe } from 'fp-ts/lib/function'
import * as NA from 'fp-ts/lib/NonEmptyArray'
import * as RA from 'fp-ts/lib/ReadonlyArray'
import { not } from 'fp-ts/lib/Refinement'
import * as SRTE from 'fp-ts/lib/StateReaderTaskEither'
import micromatch from 'micromatch'
import * as API from '../../../icloud/drive/api/methods'
import { Use } from '../../../icloud/drive/api/type'
import * as DF from '../../../icloud/drive/drive'
import {
  fileName,
  isCloudDocsRootDetailsG,
  isFile,
  isNotRootDetails,
  isTrashDetailsG,
} from '../../../icloud/drive/requests/types/types'
import { err } from '../../../lib/errors'
import { NEA, XXX } from '../../../lib/types'
import { normalizePath } from './helpers'

type Deps = DF.DriveMEnv & Use<'moveItemsToTrash'> & SchemaEnv

export const rma = (
  { paths, trash }: {
    paths: string[]
    trash: boolean
  },
): XXX<DF.State, Deps, string> => {
  assert(A.isNonEmpty(paths))

  const npaths = pipe(paths, NA.map(normalizePath))

  const scanned = pipe(
    paths as NEA<string>,
    NA.map(micromatch.scan),
  )

  const basepaths = pipe(scanned, NA.map(_ => _.base), NA.map(normalizePath))

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
        // SRTE.local(() => ({ moveItemsToTrash: api.schema.moveItemsToTrash(api.depsEnv) })),
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
import * as E from 'fp-ts/Either'
import { toArray } from 'fp-ts/lib/ReadonlyArray'
import { fst, snd } from 'fp-ts/lib/ReadonlyTuple'
import * as O from 'fp-ts/Option'
import { SchemaEnv } from '../../../icloud/drive/api/basic'
import { Path } from '../../../lib/util'
import { ask } from './upload'
export const rm = (
  { paths, trash }: {
    paths: string[]
    trash: boolean
  },
): XXX<DF.State, Deps, void> => {
  assert(A.isNonEmpty(paths))

  const npaths = pipe(paths, NA.map(normalizePath))

  const scanned = pipe(
    paths,
    NA.map(micromatch.scan),
  )

  const { left: directs, right: globs } = pipe(
    scanned,
    A.partitionMap(scan =>
      scan.glob.length == 0
        ? E.left(scan.input)
        : E.right(scan.input)
    ),
  )

  const basepaths = pipe(scanned, NA.map(_ => _.base), NA.map(normalizePath))

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
