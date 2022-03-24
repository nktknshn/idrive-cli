import child_process from 'child_process'
import { randomUUID } from 'crypto'
import { pipe } from 'fp-ts/lib/function'
import * as NA from 'fp-ts/lib/NonEmptyArray'
// import * as NM from '../../../icloud/drive/api/methods'
import * as RTE from 'fp-ts/lib/ReaderTaskEither'
import * as SRTE from 'fp-ts/lib/StateReaderTaskEither'
import * as O from 'fp-ts/Option'
import { tempDir } from '../../../defaults'
import * as API from '../../../icloud/drive/deps/api-methods'
import { DepApi } from '../../../icloud/drive/deps/api-type'
import { DepFetchClient } from '../../../icloud/drive/deps/util'
import * as Drive from '../../../icloud/drive/drive'
import { isFile } from '../../../icloud/drive/types'
import { err } from '../../../lib/errors'
import { DepFs } from '../../../lib/fs'
import { logger } from '../../../lib/logging'
import { XXX } from '../../../lib/types'
import { consumeStreamToString, Path } from '../../../lib/util'
import { upload } from '.'
import { normalizePath } from './helpers'

type Deps =
  & Drive.Deps
  & DepApi<'download'>
  & DepApi<'renameItems'>
  & DepApi<'moveItemsToTrash'>
  & API.UploadMethodDeps
  & DepFetchClient
  & DepFs<'fstat' | 'writeFile'>

export const edit = (
  { path }: { path: string },
): XXX<Drive.State, Deps, string> => {
  const npath = pipe(path, normalizePath)

  const tempFile = Path.join(
    tempDir,
    Path.basename(npath) + '.' + randomUUID().substring(0, 8),
  )

  logger.debug(`temp file: ${tempFile}`)

  return pipe(
    Drive.chainCachedDocwsRoot(root => Drive.getByPathsStrict(root, [npath])),
    SRTE.map(NA.head),
    SRTE.filterOrElse(isFile, () => err(`you cannot cat a directory`)),
    SRTE.chainW((item) => API.getItemUrl<Drive.State>(item)),
    SRTE.chainW((url) =>
      pipe(
        O.fromNullable(url),
        O.match(
          () => SRTE.left(err(`cannot get url`)),
          url =>
            SRTE.fromReaderTaskEither(pipe(
              API.getUrlStream({ url }),
              RTE.chainTaskEitherK(consumeStreamToString),
            )),
        ),
      )
    ),
    SRTE.chainReaderTaskEitherK(
      (data) => RTE.asks(({ fs }: Deps) => fs.writeFile(tempFile, data)),
    ),
    SRTE.chainW((): Drive.Effect<NodeJS.Signals | null> => {
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
