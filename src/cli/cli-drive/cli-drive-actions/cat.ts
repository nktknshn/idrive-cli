import { pipe } from 'fp-ts/lib/function'
import * as NA from 'fp-ts/lib/NonEmptyArray'
import * as RTE from 'fp-ts/lib/ReaderTaskEither'
import * as SRTE from 'fp-ts/lib/StateReaderTaskEither'
import * as O from 'fp-ts/Option'
import { DepFetchClient } from '../../../icloud/deps'
import { getUrlStream } from '../../../icloud/deps/getUrlStream'
import { DriveApi, DriveQuery } from '../../../icloud/drive'
import { DepDriveApi } from '../../../icloud/drive/drive-api/deps'
import { isFile } from '../../../icloud/drive/icloud-drive-types'
import { err } from '../../../util/errors'
import { normalizePath } from '../../../util/normalize-path'
import { consumeStreamToString } from '../../../util/util'

type Deps =
  & DriveQuery.Deps
  & DepDriveApi<'download'>
  & DepFetchClient

export const cat = (
  { path }: { path: string },
): DriveQuery.Effect<string, Deps> => {
  const npath = pipe(path, normalizePath)

  return pipe(
    DriveQuery.getCachedDocwsRoot(),
    SRTE.bindW('item', (root) =>
      pipe(
        DriveQuery.getByPathsStrict(root, [npath]),
        SRTE.map(NA.head),
        SRTE.filterOrElse(isFile, () => err(`you cannot cat a directory`)),
      )),
    SRTE.chainW(({ item }) => DriveApi.getICloudItemUrl<DriveQuery.State>(item)),
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
