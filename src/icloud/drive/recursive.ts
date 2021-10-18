import * as A from 'fp-ts/lib/Array'
import * as B from 'fp-ts/lib/boolean'
import * as E from 'fp-ts/lib/Either'
import { apply, flow, hole, pipe } from 'fp-ts/lib/function'
import * as O from 'fp-ts/lib/Option'
import * as R from 'fp-ts/lib/Record'
import * as TE from 'fp-ts/lib/TaskEither'
import { get } from 'spectacles-ts'
import { logger, logReturn, logReturnAs } from '../../lib/logging'
import { Drive } from './drive'
import { DriveDetails, FolderItem, isFolderItem, isNotRootDetails, RecursiveFolder } from './types'

export function getFolderRecursive(
  drive: Drive,
  path: string,
  depth: number,
): TE.TaskEither<Error, RecursiveFolder> {
  /*   const subFolders = pipe(
    parent,
    TE.map(_ => _.items),
    TE.map(A.filter(isFolderItem)),
  )
 */
  return pipe(
    TE.Do,
    TE.bind('parent', () => drive.getFolderByPath(path)),
    TE.bind('children', ({ parent }) => getFolders(drive, [parent.drivewsid], depth)),
    TE.map(_ => _.children[0]),
    // TE.map(({ children, parent }) => deepFolder(parent, children)),
  )
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
  parents: DriveDetails[],
  childrenRec: Record<string, RecursiveFolder[]>,
): (readonly [DriveDetails, RecursiveFolder[]])[] =>
  pipe(
    parents,
    A.map(parent =>
      [
        parent,
        pipe(
          childrenRec,
          // logReturnAs('childrenRec'),
          R.lookup(parent.drivewsid),
          O.getOrElse((): RecursiveFolder[] => []),
        ),
      ] as const
    ),
  )

function getFolders(
  drive: Drive,
  drivewsids: string[],
  depth: number,
): TE.TaskEither<Error, RecursiveFolder[]> {
  const M = A.getMonoid<FolderItem>()

  logger.debug(`getFolders ${drivewsids} ${depth}`)

  const res = pipe(
    TE.Do,
    TE.bind('folders', () => drive.getFoldersByIds(drivewsids)),
    TE.bindW('foldersItems', ({ folders }) =>
      pipe(
        folders,
        A.map(folder => pipe(folder.items, A.filter(isFolderItem))),
        A.reduce(M.empty, M.concat),
        TE.of,
      )),
    TE.bindW('doGoDeeper', ({ foldersItems }) =>
      pipe(
        foldersItems.length,
        count => depth > 0 && count > 0,
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
    TE.chain(({ folders, foldersItems, doGoDeeper }) =>
      pipe(
        doGoDeeper,
        B.match(
          () => TE.of(pipe(folders, A.map(shallowFolder))),
          () =>
            pipe(
              getFolders(drive, foldersItems.map(_ => _.drivewsid), depth - 1),
              // TE.map(logReturnAs('subs')),
              // FIXME
              TE.map(groupBy(_ => isNotRootDetails(_.details) ? _.details.parentId : 'ERROR')),
              // TE.map(logReturnAs('group')),
              TE.map(g => zipWithChildren(folders, g)),
              TE.map(A.map(([p, c]) => deepFolder(p, c))),
            ),
        ),
      )
    ),
  )

  return res
}
