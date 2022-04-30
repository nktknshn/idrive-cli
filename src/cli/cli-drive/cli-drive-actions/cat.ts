import { pipe } from 'fp-ts/lib/function'
import * as NA from 'fp-ts/lib/NonEmptyArray'
import * as RTE from 'fp-ts/lib/ReaderTaskEither'
import * as SRTE from 'fp-ts/lib/StateReaderTaskEither'
import * as O from 'fp-ts/Option'
import { DepFetchClient } from '../../../icloud/deps/DepFetchClient'
import { Drive, DriveApi } from '../../../icloud/drive'
import { DepDriveApi } from '../../../icloud/drive/deps'
import { getUrlStream } from '../../../icloud/drive/deps/getUrlStream'
import { isFile } from '../../../icloud/drive/drive-types'
import { err } from '../../../util/errors'
import { normalizePath } from '../../../util/normalize-path'
import { consumeStreamToString } from '../../../util/util'

type Deps =
  & Drive.Deps
  & DepDriveApi<'download'>
  & DepFetchClient

export const cat = (
  { path }: { path: string },
): Drive.Effect<string, Deps> => {
  const npath = pipe(path, normalizePath)

  return pipe(
    Drive.getCachedDocwsRoot(),
    SRTE.bindW('item', (root) =>
      pipe(
        Drive.getByPathsStrict(root, [npath]),
        SRTE.map(NA.head),
        SRTE.filterOrElse(isFile, () => err(`you cannot cat a directory`)),
      )),
    SRTE.chainW(({ item }) => DriveApi.getICloudItemUrl<Drive.State>(item)),
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
