import * as A from 'fp-ts/lib/Array'
import * as B from 'fp-ts/lib/boolean'
import { apply, pipe } from 'fp-ts/lib/function'
import * as O from 'fp-ts/lib/Option'
import * as R from 'fp-ts/lib/Record'
import * as TE from 'fp-ts/lib/TaskEither'
import { err } from '../../lib/errors'
import { logger } from '../../lib/logging'
import { Details, FolderLikeItem, isFolderLikeItem, isNotRootDetails, RecursiveFolder } from './types'
/*
export function getFolderRecursive(
  drive: Drive,
  path: string,
  depth: number,
): TE.TaskEither<Error, RecursiveFolder> {
  return pipe(
    TE.Do,
    TE.bind('parent', () => drive.getFolderByPath(path)),
    TE.bind('children', ({ parent }) => getFolders(drive, [parent.drivewsid], depth)),
    TE.chain(_ =>
      pipe(
        A.lookup(0, _.children),
        TE.fromOption(() => error(`something wrong...`)),
      )
    ),
  )
}

function getFolders(
  drive: Drive,
  drivewsids: string[],
  depth: number,
): TE.TaskEither<Error, RecursiveFolder[]> {
  const M = A.getMonoid<FolderLikeItem>()

  logger.debug(`getFolders ${drivewsids} ${depth}`)

  const res = pipe(
    TE.Do,
    TE.bind('folders', () => drive.getFoldersByIds(drivewsids)),
    TE.bindW('foldersItems', ({ folders }) =>
      pipe(
        folders,
        A.map(folder => pipe(folder.items, A.filter(isFolderLikeItem))),
        A.reduce(M.empty, M.concat),
        TE.of,
      )),
    TE.bindW('g', ({ foldersItems }) =>
      pipe(
        {
          doGoDeeper: depth > 0 && foldersItems.length > 0,
          emptySubfolders: foldersItems.length == 0 && depth > 0,
          depthExceed: foldersItems.length > 0 && depth == 0,
        },
        TE.of,
      )),
    // TE.map(
    //   logReturn(({ folders, foldersItems, doGoDeeper }) =>
    //     logger.debug({
    //       doGoDeeper,
    //       foldersItems,
    //     })
    //   ),
    // ),
    TE.chain(({ folders, foldersItems, g: { depthExceed, doGoDeeper, emptySubfolders } }) =>
      pipe(
        doGoDeeper
          ? pipe(
            getFolders(drive, foldersItems.map(_ => _.drivewsid), depth - 1),
            // FIXME
            TE.map(groupBy(_ => isNotRootDetails(_.details) ? _.details.parentId : 'ERROR')),
            TE.map(g => zipWithChildren(folders, g)),
            TE.map(A.map(([p, c]) => deepFolder(p, c))),
          )
          : depthExceed
          ? TE.of(pipe(folders, A.map(shallowFolder)))
          : TE.of(pipe(folders, A.map(f => deepFolder(f, [])))),
      )
    ),
  )

  return res
}

const shallowFolder = (details: DriveDetails): RecursiveFolder => ({
  details,
  deep: false,
})

const deepFolder = (details: DriveDetails, children: RecursiveFolder[]): RecursiveFolder => ({
  details,
  children,
  deep: true,
})

const groupBy = <T>(f: (item: T) => string): (items: T[]) => Record<string, T[]> =>
  (items: T[]): Record<string, T[]> => {
    let result: Record<string, T[]> = {}

    for (const el of items) {
      result = pipe(
        result,
        R.lookup(f(el)),
        O.getOrElse((): T[] => []),
        children => R.upsertAt(f(el), [...children, el]),
        apply(result),
      )
    }

    return result
  }

const zipWithChildren = (
  folders: DriveDetails[],
  itemByParentId: Record<string, RecursiveFolder[]>,
): (readonly [DriveDetails, RecursiveFolder[]])[] =>
  pipe(
    folders,
    A.map(folder =>
      [
        folder,
        pipe(
          itemByParentId,
          R.lookup(folder.drivewsid),
          O.getOrElseW(() => []),
        ),
      ] as const
    ),
  )
 */
