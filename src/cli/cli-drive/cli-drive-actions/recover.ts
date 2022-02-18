import { pipe } from 'fp-ts/lib/function'
import * as NA from 'fp-ts/lib/NonEmptyArray'
import { not } from 'fp-ts/lib/Refinement'
import * as SRTE from 'fp-ts/lib/StateReaderTaskEither'
import { defaultApiEnv } from '../../../defaults'
import * as API from '../../../icloud/drive/api'
import * as DF from '../../../icloud/drive/ffdrive'
import { cliActionM2 } from '../../../icloud/drive/ffdrive/cli-action'
import { isTrashDetailsG } from '../../../icloud/drive/requests/types/types'
import { err } from '../../../lib/errors'
import { normalizePath } from './helpers'

export const recover = (
  { sessionFile, cacheFile, path, noCache }: {
    path: string
    noCache: boolean
    sessionFile: string
    cacheFile: string
  },
) => {
  const npath = pipe(path, normalizePath)

  return pipe(
    { sessionFile, cacheFile, noCache, ...defaultApiEnv },
    cliActionM2(() => {
      return pipe(
        DF.Do,
        SRTE.bind('item', () =>
          pipe(
            DF.chainTrash(root => DF.getByPathsE(root, [npath])),
            DF.map(NA.head),
            DF.filterOrElse(not(isTrashDetailsG), () => err(`you cannot recover trash root`)),
          )),
        SRTE.chain(({ item }) =>
          pipe(
            API.putBackItemsFromTrash([item]),
            DF.fromApiRequest,
            // DF.map(_ => _.items[0].)
            DF.map(() => `Success.`),
          )
        ),
      )
    }),
  )
}
