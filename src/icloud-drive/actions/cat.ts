import { pipe } from 'fp-ts/lib/function'
import * as NA from 'fp-ts/lib/NonEmptyArray'
import * as RTE from 'fp-ts/lib/ReaderTaskEither'
import * as SRTE from 'fp-ts/lib/StateReaderTaskEither'
import * as O from 'fp-ts/Option'

import { DepFetchClient } from '../../deps-types'
import { DriveLookup } from '../../icloud-drive'
import { err } from '../../util/errors'
import { getUrlStream } from '../../util/http/getUrlStream'
import { normalizePath } from '../../util/normalize-path'
import { consumeStreamToString } from '../../util/util'
import { DepApiMethod } from '../drive-api'
import { getICloudItemUrl } from '../drive-api/extra'
import { isFile } from '../drive-types'

export type Deps =
  & DriveLookup.Deps
  & DepApiMethod<'download'>
  & DepFetchClient

export const cat = (
  { path }: { path: string },
): DriveLookup.Lookup<string, Deps> => {
  const npath = pipe(path, normalizePath)

  return pipe(
    DriveLookup.getCachedDocwsRoot(),
    SRTE.bindW('item', (root) =>
      pipe(
        DriveLookup.getByPathsStrict(root, [npath]),
        SRTE.map(NA.head),
        SRTE.filterOrElse(isFile, () => err(`you cannot cat a directory`)),
      )),
    SRTE.chainW(({ item }) => getICloudItemUrl(item)),
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
