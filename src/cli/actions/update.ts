import * as A from 'fp-ts/lib/Array'
import { constant, flow, identity, pipe } from 'fp-ts/lib/function'
import * as J from 'fp-ts/lib/Json'
import * as O from 'fp-ts/lib/Option'
import * as TE from 'fp-ts/lib/TaskEither'
import { isFolderLikeCacheEntity } from '../../icloud/drive/cache/cachef'
import { CacheEntityAppLibrary, CacheEntityFolder } from '../../icloud/drive/cache/types'
import { Drive } from '../../icloud/drive/drive'
import { DriveDetails, isFolderDetails, isNotRootDetails, isRootDetails } from '../../icloud/drive/types'
import { error } from '../../lib/errors'
import { cliAction } from '../cli-action'
import { Env } from '../types'
type Output = string
type ErrorOutput = Error

type Change = 'ParentChanged'

const wasChanged = (
  cached: CacheEntityFolder | CacheEntityAppLibrary,
  freshDetails: DriveDetails,
) => {
  return {
    etag: cached.content.etag !== freshDetails.etag,
    parentId: isNotRootDetails(freshDetails)
      && isNotRootDetails(cached.content)
      && cached.content.parentId !== freshDetails.parentId,
    details: !cached.hasDetails && isFolderDetails(freshDetails),
    wasRenamed: cached.content.name !== freshDetails.name,
    wasReplaced: cached.content.drivewsid !== freshDetails.drivewsid,
    newItems: [],
    removedItems: [],
  }
}

export const update = (
  { sessionFile, cacheFile, path, raw, noCache, recursive, depth, dontSaveCache = true }: Env & {
    recursive: boolean
    path: string
    fullPath: boolean
    depth: number
    dontSaveCache?: boolean
  },
): TE.TaskEither<ErrorOutput, Output> => {
  return cliAction(
    { sessionFile, cacheFile, noCache, dontSaveCache },
    ({ cache, drive, api }) =>
      pipe(
        TE.Do,
        TE.bind('cached', () =>
          pipe(
            cache.getByPath(path),
            TE.fromOption(() => error(`missing ${path} in cache`)),
            TE.filterOrElse(isFolderLikeCacheEntity, () => error(`is not folder`)),
          )),
        TE.chain(({ cached }) => {
          return pipe(
            api.retrieveItemDetailsInFolder(cached.content.drivewsid),
            TE.map(details => wasChanged(cached, details)),
          )
          // const etag = cached.content.etag
          // const parentChanged =
        }),
        _ => _,
        TE.chain(flow(J.stringify, TE.fromEither)),
        TE.mapLeft((e) => error(`${e}`)),
        // TE.fold(() => async, identity),
      ),
  )
}
