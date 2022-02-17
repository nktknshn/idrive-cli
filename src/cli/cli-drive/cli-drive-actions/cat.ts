import assert from 'assert'
import * as A from 'fp-ts/lib/Array'
import { flow, pipe } from 'fp-ts/lib/function'
import * as NA from 'fp-ts/lib/NonEmptyArray'
import { not } from 'fp-ts/lib/Refinement'
import * as SRTE from 'fp-ts/lib/StateReaderTaskEither'
import * as TE from 'fp-ts/lib/TaskEither'
import { defaultApiEnv } from '../../../defaults'
import * as API from '../../../icloud/drive/api'
import * as DF from '../../../icloud/drive/ffdrive'
import { cliActionM2 } from '../../../icloud/drive/ffdrive/cli-action'
import { consumeStream, getUrlStream } from '../../../icloud/drive/requests/download'
import { isCloudDocsRootDetailsG, isFile, isTrashDetailsG } from '../../../icloud/drive/requests/types/types'
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
  return pipe(
    { sessionFile, cacheFile, noCache, ...defaultApiEnv },
    cliActionM2(() => {
      const npath = pipe(path, normalizePath)

      return pipe(
        DF.Do,
        SRTE.bind('item', () =>
          pipe(
            DF.chainRoot(root => DF.getByPathsE(root, [npath])),
            DF.chain(flow(A.lookup(0), DF.fromOption(() => err(`missing file`)))),
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
                      TE.chain(consumeStream),
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
