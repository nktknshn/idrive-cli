import { pipe } from 'fp-ts/lib/function'
import * as NA from 'fp-ts/lib/NonEmptyArray'
import * as RTE from 'fp-ts/lib/ReaderTaskEither'
import * as SRTE from 'fp-ts/lib/StateReaderTaskEither'
import * as O from 'fp-ts/Option'

import { DepFetchClient } from '../../deps-types'
import { Cache, DriveCache, DriveLookup } from '../../icloud-drive'
import { err } from '../../util/errors'
import { getUrlStream } from '../../util/http/getUrlStream'
import { normalizePath } from '../../util/normalize-path'
import { consumeStreamToString } from '../../util/util'
import { DepApiMethod } from '../drive-api'
import { getDriveItemUrl } from '../drive-api/extra'
import { isFile } from '../drive-types'

export type Deps =
  & DriveLookup.Deps
  & DepApiMethod<'download'>
  & DepFetchClient

export const cat = (
  { path, skipValidation }: { path: string; skipValidation: boolean },
): DriveLookup.Lookup<string, Deps> => {
  const npath = pipe(path, normalizePath)

  const fromCache = pipe(
    DriveCache.getCache(),
    SRTE.bindTo('cache'),
    SRTE.bindW('root', ({ cache }) => SRTE.fromEither(Cache.getDocwsRoot(cache))),
    SRTE.chainEitherK(({ root, cache }) => Cache.getByPathStrict(root.content, npath)(cache)),
    SRTE.filterOrElse(isFile, () => err(`you cannot cat a directory`)),
  )

  return pipe(
    DriveLookup.getCachedDocwsRoot(),
    SRTE.bindW('item', (root) =>
      skipValidation
        ? fromCache
        : pipe(
          DriveLookup.getByPathsStrict(root, [npath]),
          SRTE.map(NA.head),
          SRTE.filterOrElse(isFile, () => err(`you cannot cat a directory`)),
        )),
    SRTE.chainW(({ item }) => getDriveItemUrl(item)),
    SRTE.chainOptionK(() => err(`cannot get url`))(O.fromNullable),
    SRTE.chainW((url) =>
      SRTE.fromReaderTaskEither(
        pipe(
          getUrlStream({ url }),
          RTE.chainTaskEitherK(consumeStreamToString),
        ),
      )
    ),
  )
}
