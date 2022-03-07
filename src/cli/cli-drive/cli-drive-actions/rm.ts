import assert from 'assert'
import * as A from 'fp-ts/lib/Array'
import { pipe } from 'fp-ts/lib/function'
import * as NA from 'fp-ts/lib/NonEmptyArray'
import { not } from 'fp-ts/lib/Refinement'
import * as SRTE from 'fp-ts/lib/StateReaderTaskEither'
import micromatch from 'micromatch'
import { Use } from '../../../icloud/drive/api/type'
import * as DF from '../../../icloud/drive/drive'
import { fileName, isCloudDocsRootDetailsG, isFile, isTrashDetailsG } from '../../../icloud/drive/requests/types/types'
import { err } from '../../../lib/errors'
import { NEA, XXX } from '../../../lib/types'
import { normalizePath } from './helpers'

type Deps = DF.DriveMEnv & Use<'moveItemsToTrashM'>

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
    SRTE.bindTo('api'),
    SRTE.bindW('items', () =>
      pipe(
        DF.chainRoot(root => DF.getByPaths(root, npaths)),
        SRTE.filterOrElse(not(A.some(isTrashDetailsG)), () => err(`you cannot remove root`)),
        SRTE.filterOrElse(not(A.some(isCloudDocsRootDetailsG)), () => err(`you cannot remove trash`)),
      )),
    SRTE.bindW('result', ({ items, api }) =>
      pipe(
        api.moveItemsToTrashM<DF.State>({ items, trash }),
        SRTE.chain(
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
import { fst } from 'fp-ts/lib/ReadonlyTuple'
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

  const basepaths = pipe(scanned, NA.map(_ => _.base), NA.map(normalizePath))

  return pipe(
    SRTE.ask<DF.State, Deps>(),
    SRTE.bindTo('api'),
    SRTE.bindW('items', () =>
      pipe(
        DF.chainRoot(root => DF.getByPaths(root, basepaths)),
        SRTE.map(NA.zip(scanned)),
      )),
    SRTE.bindW('remove', ({ items, api }) => {
      const { left: directs, right: globs } = pipe(
        items,
        A.partition(([item, scan]) => scan.glob.length > 0),
      )

      const es = pipe(
        globs,
        A.map(([item, scan]) =>
          isFile(item)
            ? E.left(err(`${scan.input} is invalid`))
            : E.right(
              pipe(
                item.items,
                A.filter(item =>
                  micromatch.isMatch(
                    fileName(item),
                    scan.glob,
                    { basename: true },
                  )
                ),
              ),
            )
        ),
        E.sequenceArray,
        E.map(toArray),
        E.map(A.flatten),
        E.map(A.concatW(pipe(directs, A.map(fst)))),
        // E.map(A.map(fileName)),
      )

      return SRTE.fromEither(es)
    }),
    SRTE.chainW(({ remove, api }) =>
      pipe(
        api.moveItemsToTrashM<DF.State>({ items: remove, trash }),
        SRTE.chain(
          resp => DF.removeByIds(resp.items.map(_ => _.drivewsid)),
        ),
      )
    ),
    // SRTE.chain(() => DF.lsdir(parentPath)),
    // SRTE.map((toberemoved) => toberemoved.map(_ => _.)),
    // SRTE.map(showDetailsInfo({
    //   fullPath: false,
    //   path: '',
    // })),
  )
}
