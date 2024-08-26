import * as E from 'fp-ts/lib/Either'
import { pipe } from 'fp-ts/lib/function'
import * as SRTE from 'fp-ts/lib/StateReaderTaskEither'
import * as T from '../../drive-types'
import { rootDrivewsid, trashDrivewsid } from '../../drive-types/types-io'
import { chain, Deps, Lookup, map, of } from '..'
import * as C from '../cache'
import { CacheEntityFolderRootDetails, CacheEntityFolderTrashDetails } from '../cache/cache-types'
import { chainCache } from './cache-methods'
import {
  retrieveItemDetailsInFoldersCached,
  retrieveItemDetailsInFoldersSaving,
} from './cache-retrieveItemDetailsInFolders'

/** retrieve root from cache or from api if it's missing from cache and chain a computation*/
export const chainCachedDocwsRoot = <A>(
  f: (root: T.DetailsDocwsRoot) => Lookup<A>,
): Lookup<A> => {
  return pipe(
    retrieveItemDetailsInFoldersCached([rootDrivewsid]),
    chain(() => chainCache(cache => SRTE.fromEither(C.getDocwsRoot(cache)))),
    map(_ => _.content),
    chain(f),
  )
}

export const getCachedDocwsRoot = (): Lookup<T.DetailsDocwsRoot, Deps> => chainCachedDocwsRoot(of)

export const getCachedRoot = (trash: boolean): Lookup<T.Root> => {
  return pipe(
    retrieveItemDetailsInFoldersCached([rootDrivewsid, trashDrivewsid]),
    chain(() =>
      chainCache(cache =>
        SRTE.fromEither(pipe(
          (trash ? C.getTrash : C.getDocwsRoot)(cache),
          E.map((_: CacheEntityFolderTrashDetails | CacheEntityFolderRootDetails) => _.content),
        ))
      )
    ),
  )
}

export const chainCachedTrash = <A>(
  f: (root: T.DetailsTrashRoot) => Lookup<A>,
): Lookup<A> => {
  return pipe(
    retrieveItemDetailsInFoldersCached([trashDrivewsid]),
    chain(() => chainCache(SRTE.fromEitherK(C.getTrash))),
    map(_ => _.content),
    chain(f),
  )
}

// FIXME
export const getDocwsRoot = (): Lookup<T.DetailsDocwsRoot, Deps> =>
  pipe(
    retrieveItemDetailsInFoldersSaving<T.DetailsDocwsRoot>([rootDrivewsid]),
    SRTE.map(_ => _[0].value),
  )

export const getTrash = (): Lookup<T.DetailsTrashRoot, Deps> =>
  pipe(
    retrieveItemDetailsInFoldersSaving<T.DetailsTrashRoot>([trashDrivewsid]),
    SRTE.map(_ => _[0].value),
  )
