import { pipe } from 'fp-ts/lib/function'
import * as NA from 'fp-ts/lib/NonEmptyArray'
import * as SRTE from 'fp-ts/lib/StateReaderTaskEither'
import * as TE from 'fp-ts/lib/TaskEither'
import { defaultApiEnv } from '../../../defaults'
import * as API from '../../../icloud/drive/api'
import * as DF from '../../../icloud/drive/ffdrive'
import { cliActionM2 } from '../../../icloud/drive/ffdrive/cli-action'
import { consumeStreamToString, getUrlStream } from '../../../icloud/drive/requests/download'
import { isFile } from '../../../icloud/drive/requests/types/types'
import { err } from '../../../lib/errors'
import { normalizePath } from './helpers'

export const cat = (
  { sessionFile, cacheFile, path, noCache, trash }: {
    path: string
    noCache: boolean
    sessionFile: string
    cacheFile: string
    trash: boolean
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
            DF.chainRoot(root => DF.getByPathsE(root, [npath])),
            DF.map(NA.head),
            DF.filterOrElse(isFile, () => err(`you cannot cat a directory`)),
          )),
        SRTE.chain(({ item }) =>
          pipe(
            API.download(item),
            DF.fromApiRequest,
            DF.chain(
              url =>
                DF.readEnvS(
                  ({ env }) =>
                    pipe(
                      getUrlStream({ url, client: env.fetch }),
                      TE.chain(consumeStreamToString),
                      DF.fromTaskEither,
                    ),
                ),
            ),
          )
        ),
      )
    }),
  )
}