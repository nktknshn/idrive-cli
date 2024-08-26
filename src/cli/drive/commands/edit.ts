import child_process from 'child_process'
import { randomUUID } from 'crypto'
import { pipe } from 'fp-ts/lib/function'
import * as NA from 'fp-ts/lib/NonEmptyArray'
import * as R from 'fp-ts/lib/Reader'
import * as SRTE from 'fp-ts/lib/StateReaderTaskEither'
import * as O from 'fp-ts/Option'
import { Readable } from 'stream'

import { DepFetchClient, DepFs } from '../../../deps-types'
import { DriveLookup } from '../../../icloud-drive'
import { Types } from '../../../icloud-drive'
import { DepApiMethod } from '../../../icloud-drive/drive-api'
import { getICloudItemUrl } from '../../../icloud-drive/drive-api/extra'
import { err } from '../../../util/errors'
import { getUrlStream } from '../../../util/http/getUrlStream'
import { normalizePath, Path } from '../../../util/path'
import { writeFileFromReadable } from '../../../util/writeFileFromReadable'
import { Deps as UploadDeps, uploadSingleFile } from './upload/uploads'

type Deps =
  // lookup deps
  & DriveLookup.Deps
  & DepApiMethod<'download'>
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
): DriveLookup.Lookup<string, Deps> => {
  const npath = pipe(path, normalizePath)

  const tempFile = ({ tempdir }: Deps) =>
    Path.join(
      tempdir,
      Path.basename(npath) + '.' + randomUUID().substring(0, 8),
    )

  // logger.debug(`temp file: ${tempFile}`)

  return pipe(
    DriveLookup.chainCachedDocwsRoot(root => DriveLookup.getByPathsStrict(root, [npath])),
    SRTE.map(NA.head),
    SRTE.filterOrElse(Types.isFile, () => err(`You cannot edit a directory.`)),
    SRTE.chainW((item) => getICloudItemUrl(item)),
    SRTE.map(O.fromNullable),
    SRTE.chain(a => SRTE.fromOption(() => err(`Empty file url was returned.`))(a)),
    a => a,
    // SRTE.chainReaderTaskEitherKW(url => getUrlStream({ url })),
    SRTE.chainW(url =>
      SRTE.fromReaderTaskEitherK((url: string) => getUrlStream({ url }))<DriveLookup.LookupState>(url)
    ),
    SRTE.chainW(readable =>
      pipe(
        SRTE.of<DriveLookup.LookupState, Deps, Error, { readable: Readable }>({ readable }),
        SRTE.bind('tempFile', ({ readable }) => SRTE.fromReader(R.asks(tempFile))),
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
