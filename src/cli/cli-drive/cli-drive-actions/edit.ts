import assert from 'assert'
import * as A from 'fp-ts/lib/Array'
import { pipe } from 'fp-ts/lib/function'
import * as NA from 'fp-ts/lib/NonEmptyArray'
import * as SRTE from 'fp-ts/lib/StateReaderTaskEither'
import * as TE from 'fp-ts/lib/TaskEither'
import fs from 'fs/promises'
import { defaultApiEnv, tempDir } from '../../../defaults'
import * as API from '../../../icloud/drive/api'
import * as DF from '../../../icloud/drive/ffdrive'
import { cliActionM2 } from '../../../icloud/drive/ffdrive/cli-action'
import { consumeStreamToString, getUrlStream } from '../../../icloud/drive/requests/download'
import { isFile } from '../../../icloud/drive/requests/types/types'
import { err } from '../../../lib/errors'
import { normalizePath } from './helpers'

import child_process from 'child_process'
import { randomUUID } from 'crypto'
import { logger } from '../../../lib/logging'
import { Path } from '../../../lib/util'
import { upload } from '.'

export const edit = (
  { sessionFile, cacheFile, path, noCache, trash }: {
    path: string
    noCache: boolean
    sessionFile: string
    cacheFile: string
    trash: boolean
  },
) => {
  const npath = pipe(path, normalizePath)

  const tempFile = Path.join(
    tempDir,
    Path.basename(npath) + '.' + randomUUID().substring(0, 8),
  )

  logger.debug(`temp file: ${tempFile}`)

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
        SRTE.chain((data) => {
          return pipe(
            SRTE.fromTask(
              () => fs.writeFile(tempFile, data),
            ),
            // DF.logS(() => ``),
            // SRTE.chainFirst(
            //   (): DF.DriveM<void> =>
            //     SRTE.fromIO(() => {
            //       logger.debug(`as`)
            //     }),
            // ),
          )
        }),
        SRTE.chainW((): DF.DriveM<NodeJS.Signals | null> => {
          return SRTE.fromTask(
            (): Promise<NodeJS.Signals | null> => {
              return new Promise(
                (resolve, reject) => {
                  child_process
                    .spawn(`vim`, [tempFile], {
                      // shell: true,
                      stdio: 'inherit',
                    })
                    .on('close', (code, signal) => {
                      if (code === 0) {
                        return resolve(signal)
                      }
                      return reject(code)
                    })
                },
              )
            },
          )
        }),
        DF.chain((signal) => {
          return DF.fromTaskEither(
            upload({
              sessionFile,
              cacheFile,
              noCache,
              overwright: true,
              srcpath: tempFile,
              dstpath: npath,
            }),
          )
        }),
        _ => _,
      )
    }),
  )
}