import child_process from 'child_process'
import { randomUUID } from 'crypto'
import { pipe } from 'fp-ts/lib/function'
import * as NA from 'fp-ts/lib/NonEmptyArray'
import * as SRTE from 'fp-ts/lib/StateReaderTaskEither'
import * as TE from 'fp-ts/lib/TaskEither'
import * as O from 'fp-ts/Option'
import fs from 'fs/promises'
import { tempDir } from '../../../defaults'
import * as NM from '../../../icloud/drive/api/methods'
import { Use } from '../../../icloud/drive/api/type'
import * as DF from '../../../icloud/drive/drive'
import { consumeStreamToString } from '../../../icloud/drive/requests/download'
import { isFile } from '../../../icloud/drive/requests/types/types'
import { err } from '../../../lib/errors'
import { logger } from '../../../lib/logging'
import { XXX } from '../../../lib/types'
import { Path } from '../../../lib/util'
import { upload } from '.'
import { normalizePath } from './helpers'

type Deps =
  & DF.DriveMEnv
  & Use<'downloadM'>
  & Use<'getUrlStream'>
  & Use<'renameItemsM'>
  & Use<'upload'>
  & Use<'moveItemsToTrashM'>

export const edit = (
  { path }: { path: string },
): XXX<DF.State, Deps, string> => {
  const npath = pipe(path, normalizePath)

  const tempFile = Path.join(
    tempDir,
    Path.basename(npath) + '.' + randomUUID().substring(0, 8),
  )

  logger.debug(`temp file: ${tempFile}`)

  return pipe(
    SRTE.ask<DF.State, Deps, Error>(),
    SRTE.bindTo('api'),
    SRTE.bindW('item', () =>
      pipe(
        DF.chainRoot(root => DF.getByPaths(root, [npath])),
        SRTE.map(NA.head),
        SRTE.filterOrElse(isFile, () => err(`you cannot cat a directory`)),
      )),
    SRTE.bindW('url', ({ item }) => NM.getUrl<DF.State>(item)),
    SRTE.chainW(({ api, url }) =>
      pipe(
        O.fromNullable(url),
        O.match(
          () => SRTE.left(err(`cannot get url`)),
          url =>
            SRTE.fromTaskEither(pipe(
              api.getUrlStream({ url }),
              TE.chain(consumeStreamToString),
            )),
        ),
      )
    ),
    SRTE.chain((data) => {
      return pipe(
        SRTE.fromTask(
          () => fs.writeFile(tempFile, data),
        ),
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
    SRTE.chainW((signal) => {
      return upload({
        overwright: true,
        srcpath: tempFile,
        dstpath: npath,
      })
    }),
  )
}
