import { pipe } from 'fp-ts/lib/function'
import * as NA from 'fp-ts/lib/NonEmptyArray'
import * as SRTE from 'fp-ts/lib/StateReaderTaskEither'
import * as TE from 'fp-ts/lib/TaskEither'
import { defaultApiEnv } from '../../../defaults'
import * as API from '../../../icloud/drive/api'
import * as DF from '../../../icloud/drive/drive'
import { consumeStreamToString, getUrlStream } from '../../../icloud/drive/requests/download'
import { isFile } from '../../../icloud/drive/requests/types/types'
import { err } from '../../../lib/errors'
import { cliActionM2 } from '../../cli-action'
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
  return cat2({ path })
}

export const cat2 = (
  { path }: { path: string },
): SRTE.StateReaderTaskEither<DF.DriveMState, DF.DriveMEnv, Error, string> => {
  const npath = pipe(path, normalizePath)

  return pipe(
    DF.chainRoot(root => DF.getByPaths(root, [npath])),
    SRTE.map(NA.head),
    SRTE.filterOrElse(isFile, () => err(`you cannot cat a directory`)),
    SRTE.chain((item) =>
      pipe(
        API.download<DF.DriveMState>(item),
        SRTE.chain(
          url =>
            url
              ? DF.readEnvS(
                ({ env }) =>
                  pipe(
                    getUrlStream({ url, client: env.fetch }),
                    TE.chain(consumeStreamToString),
                    DF.fromTaskEither,
                  ),
              )
              : SRTE.left(err(`cannot get url`)),
        ),
      )
    ),
  )
}
