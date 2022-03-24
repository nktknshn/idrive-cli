import { pipe } from 'fp-ts/lib/function'
import * as NA from 'fp-ts/lib/NonEmptyArray'
import * as RTE from 'fp-ts/lib/ReaderTaskEither'
import * as SRTE from 'fp-ts/lib/StateReaderTaskEither'
import * as O from 'fp-ts/Option'
import { Api, Drive } from '../../../icloud/drive'
import { DepApi, DepFetchClient } from '../../../icloud/drive/deps/deps'
import { isFile } from '../../../icloud/drive/types'
import { err } from '../../../lib/errors'
import { normalizePath } from '../../../lib/normalize-path'
import { consumeStreamToString } from '../../../lib/util'

type Deps =
  & Drive.Deps
  & DepApi<'download'>
  & DepFetchClient

export const cat = (
  { path }: { path: string },
): Drive.Effect<string, Deps> => {
  const npath = pipe(path, normalizePath)

  return pipe(
    SRTE.ask<Drive.State, Deps>(),
    SRTE.bindTo('deps'),
    SRTE.bindW('root', () => Drive.getDocwsRoot()),
    SRTE.bindW('item', ({ root }) =>
      pipe(
        Drive.getByPathsStrict(root, [npath]),
        SRTE.map(NA.head),
        SRTE.filterOrElse(isFile, () => err(`you cannot cat a directory`)),
      )),
    SRTE.bindW('url', ({ item }) =>
      pipe(
        Api.getICloudItemUrl<Drive.State>(item),
        // deps.retrieveItemDetailsInFoldersRTE({drivewsids: [1]})
        // SRTE.local(() => ({
        //   download: deps.schema.download({ ...deps.depsEnv, fetch: failingFetch(99) }),
        // })),
      )),
    SRTE.chain(({ url }) =>
      pipe(
        O.fromNullable(url),
        O.match(
          () => SRTE.left(err(`cannot get url`)),
          (url) =>
            SRTE.fromReaderTaskEither(
              pipe(
                Api.getUrlStream({ url }),
                RTE.chainTaskEitherK(consumeStreamToString),
              ),
            ),
        ),
      )
    ),
  )
}
