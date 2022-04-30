import child_process from 'child_process'
import { randomUUID } from 'crypto'
import { pipe } from 'fp-ts/lib/function'
import * as NA from 'fp-ts/lib/NonEmptyArray'
// import * as NM from '../../../icloud/drive/api/methods'
import * as R from 'fp-ts/lib/Reader'
import * as SRTE from 'fp-ts/lib/StateReaderTaskEither'
import * as O from 'fp-ts/Option'
import { Readable } from 'stream'
// import { tempDir } from '../../../defaults'
import { DepFetchClient, DepFs } from '../../../icloud/deps/DepFetchClient'
import { Drive, DriveApi } from '../../../icloud/drive'
import { DepDriveApi } from '../../../icloud/drive/deps'
import { getUrlStream } from '../../../icloud/drive/deps/getUrlStream'
import { isFile } from '../../../icloud/drive/drive-types'
import { err } from '../../../util/errors'
import { normalizePath } from '../../../util/normalize-path'
import { Path } from '../../../util/path'
import { writeFileFromReadable } from './download/download-helpers'
import { Deps as UploadDeps, uploadSingleFile } from './upload/uploads'

type Deps =
  & Drive.Deps
  & DepDriveApi<'download'>
  & UploadDeps
  & DepFs<'fstat' | 'createWriteStream'>
  & DepFetchClient
  & { fileEditor: string }
  & { tempdir: string }

const spawnVim = ({ tempFile, fileEditor }: { tempFile: string; fileEditor: string }) =>
  (): Promise<NodeJS.Signals | null> => {
    return new Promise(
      (resolve, reject) => {
        child_process
          .spawn(fileEditor, [tempFile], {
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
    SRTE.chainW((item) => DriveApi.getICloudItemUrl(item)),
    SRTE.chainW((url) =>
      pipe(
        O.fromNullable(url),
        O.match(
          () => SRTE.left(err(`empty file url returnes`)),
          url =>
            SRTE.fromReaderTaskEither(pipe(
              getUrlStream({ url }),
              // RTE.chainTaskEitherK(consumeStreamToString),
            )),
        ),
      )
    ),
    SRTE.chainW(readable =>
      pipe(
        SRTE.of<Drive.State, Deps, Error, { readable: Readable }>({ readable }),
        SRTE.bind('tempFile', () => SRTE.fromReader(R.asks(tempFile))),
        SRTE.bind('fileEditor', () => SRTE.asks(s => s.fileEditor)),
        SRTE.bindW('writeRrsult', ({ readable, tempFile }) =>
          SRTE.fromReaderTaskEither(
            writeFileFromReadable(tempFile)(readable),
          )),
        SRTE.bind(
          'signal',
          (s) => SRTE.fromTask(spawnVim(s)),
        ),
        SRTE.chainW(({ signal, tempFile }) => {
          return uploadSingleFile({
            overwright: true,
            srcpath: tempFile,
            dstpath: npath,
            skipTrash: false,
          })
        }),
      )
    ),
  )
}
