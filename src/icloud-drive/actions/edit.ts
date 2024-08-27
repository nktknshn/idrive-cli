import child_process from 'child_process'
import { randomUUID } from 'crypto'
import { pipe } from 'fp-ts/lib/function'
import * as NA from 'fp-ts/lib/NonEmptyArray'
import * as R from 'fp-ts/lib/Reader'
import * as SRTE from 'fp-ts/lib/StateReaderTaskEither'
import * as O from 'fp-ts/Option'
import { Readable } from 'stream'

import { DepFetchClient, DepFs } from '../../deps-types'
import { err } from '../../util/errors'
import { writeFileFromReadable } from '../../util/fs/write-file'
import { getUrlStream } from '../../util/http/getUrlStream'
import { normalizePath } from '../../util/normalize-path'
import { Path } from '../../util/path'
import { DriveLookup, Types } from '..'
import { DepApiMethod } from '../drive-api'
import { getDriveItemUrl } from '../drive-api/extra'
import * as Actions from '.'

export type Deps =
  & DriveLookup.Deps
  & DepApiMethod<'download'>
  & Actions.DepsUpload
  & DepFs<'fstat' | 'createWriteStream' | 'rm'>
  & DepFetchClient
  & { tempdir: string }

// TODO add Editor interface
// TODO calc hash to check if the file was changed

const spawnVim = ({ tempFile, fileEditor }: { tempFile: string; fileEditor: string }) =>
  (): Promise<NodeJS.Signals | null> => {
    return new Promise(
      (resolve, reject) => {
        child_process
          .spawn(fileEditor, [tempFile], {
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
  { path, editor }: { path: string; editor: string },
): DriveLookup.Lookup<void, Deps> => {
  const npath = pipe(path, normalizePath)

  const tempFile = ({ tempdir }: Deps) =>
    Path.join(
      tempdir,
      Path.basename(npath) + '.' + randomUUID().substring(0, 16),
    )

  return pipe(
    DriveLookup.chainCachedDocwsRoot(root => DriveLookup.getByPathsStrict(root, [npath])),
    SRTE.map(NA.head),
    SRTE.filterOrElse(Types.isFile, () => err(`You cannot edit a directory.`)),
    SRTE.chainW((item) => getDriveItemUrl(item)),
    SRTE.map(O.fromNullable),
    SRTE.chain(a => SRTE.fromOption(() => err(`Empty file url was returned.`))(a)),
    SRTE.chainW(url => SRTE.fromReaderTaskEitherK((url: string) => getUrlStream({ url }))(url)),
    SRTE.chainW(readable =>
      pipe(
        SRTE.of<DriveLookup.State, Deps, Error, { readable: Readable }>({ readable }),
        SRTE.bind('tempFile', () => SRTE.fromReader(R.asks(tempFile))),
        SRTE.bind('rm', () => SRTE.asks(s => s.fs.rm)),
        SRTE.bindW('writeResult', ({ readable, tempFile }) =>
          SRTE.fromReaderTaskEither(
            writeFileFromReadable(tempFile)(readable),
          )),
        SRTE.bind('signal', s => SRTE.fromTask(spawnVim({ fileEditor: editor, tempFile: s.tempFile }))),
        SRTE.chainFirstW(({ tempFile }) => {
          return Actions.uploadSingleFile({
            overwright: true,
            srcpath: tempFile,
            dstpath: npath,
            skipTrash: false,
          })
        }),
        SRTE.chainW(({ rm, tempFile }) => SRTE.fromTaskEither(rm(tempFile))),
      )
    ),
  )
}
