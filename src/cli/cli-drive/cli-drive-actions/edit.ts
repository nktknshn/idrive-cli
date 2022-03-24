import child_process from 'child_process'
import { randomUUID } from 'crypto'
import { pipe } from 'fp-ts/lib/function'
import * as NA from 'fp-ts/lib/NonEmptyArray'
// import * as NM from '../../../icloud/drive/api/methods'
import * as R from 'fp-ts/lib/Reader'
import * as RTE from 'fp-ts/lib/ReaderTaskEither'
import * as SRTE from 'fp-ts/lib/StateReaderTaskEither'
import * as O from 'fp-ts/Option'
// import { tempDir } from '../../../defaults'
import { Api, Drive } from '../../../icloud/drive'
import { DepApi, DepFetchClient, DepFs } from '../../../icloud/drive/deps/deps'
import { isFile } from '../../../icloud/drive/types'
import { err } from '../../../lib/errors'
import { logger } from '../../../lib/logging'
import { normalizePath } from '../../../lib/normalize-path'
import { consumeStreamToString, Path } from '../../../lib/util'
import { singleFileUpload, UploadActionDeps } from './upload'

type Deps =
  & Drive.Deps
  & DepApi<'download'>
  & UploadActionDeps
  & DepFs<'fstat' | 'writeFile'>
  & DepFetchClient
  & { tempdir: string }

const spawnVim = ({ tempFile }: { tempFile: string }) =>
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
  }

export const edit = (
  { path }: { path: string },
): Drive.Effect<string, Deps> => {
  const npath = pipe(path, normalizePath)

  const tempFile = ({ tempdir }: Deps) =>
    Path.join(
      tempdir,
      Path.basename(npath) + '.' + randomUUID().substring(0, 8),
    )

  // logger.debug(`temp file: ${tempFile}`)

  return pipe(
    Drive.chainCachedDocwsRoot(root => Drive.getByPathsStrict(root, [npath])),
    SRTE.map(NA.head),
    SRTE.filterOrElse(isFile, () => err(`you cannot edit a directory`)),
    SRTE.chainW((item) => Api.getICloudItemUrl(item)),
    SRTE.chainW((url) =>
      pipe(
        O.fromNullable(url),
        O.match(
          () => SRTE.left(err(`empty file url returnes`)),
          url =>
            SRTE.fromReaderTaskEither(pipe(
              Api.getUrlStream({ url }),
              RTE.chainTaskEitherK(consumeStreamToString),
            )),
        ),
      )
    ),
    SRTE.chainW(data =>
      pipe(
        SRTE.of<Drive.State, Deps, Error, { data: string }>({ data }),
        SRTE.bind('tempFile', () => SRTE.fromReader(R.asks(tempFile))),
        SRTE.bind('writeRrsult', ({ data, tempFile }) =>
          SRTE.fromReaderTaskEither(
            ({ fs }: Deps) => (fs.writeFile(tempFile, data)),
          )),
        SRTE.bind(
          'signal',
          (s) => SRTE.fromTask(spawnVim(s)),
        ),
        SRTE.chainW(({ signal, tempFile }) => {
          return singleFileUpload({
            overwright: true,
            srcpath: tempFile,
            dstpath: npath,
          })
        }),
      )
    ),
  )
}
