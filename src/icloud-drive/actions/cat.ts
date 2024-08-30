import { pipe } from 'fp-ts/lib/function'
import * as RTE from 'fp-ts/lib/ReaderTaskEither'
import * as SRTE from 'fp-ts/lib/StateReaderTaskEither'
import * as O from 'fp-ts/Option'

import { DepFetchClient } from '../../deps-types'
import { DriveLookup } from '../../icloud-drive'
import { err } from '../../util/errors'
import { getUrlStream } from '../../util/http/getUrlStream'
import { normalizePath } from '../../util/normalize-path'
import { consumeStreamToString } from '../../util/util'
import { DepApiMethod, DriveApiMethods } from '../drive-api'
import { isFile } from '../drive-types'

export type Deps =
  & DriveLookup.Deps
  & DepApiMethod<'download'>
  & DepFetchClient

export const cat = (
  { path, skipValidation }: { path: string; skipValidation: boolean },
): DriveLookup.Lookup<string, Deps> => {
  const npath = pipe(path, normalizePath)

  return pipe(
    DriveLookup.getByPathStrictDocwsroot(npath, DriveLookup.skipValidation(skipValidation)),
    SRTE.filterOrElse(isFile, () => err(`you cannot cat a directory`)),
    SRTE.chainW((item) => DriveApiMethods.getDriveItemUrl(item)),
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
