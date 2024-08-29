import child_process from 'child_process'
import { randomUUID } from 'crypto'
import { constVoid, pipe } from 'fp-ts/lib/function'
import * as R from 'fp-ts/lib/Reader'
import * as SRTE from 'fp-ts/lib/StateReaderTaskEither'
import * as O from 'fp-ts/Option'

import { DepFetchClient, DepFs } from '../../deps-types'
import { err, FileNotFoundError } from '../../util/errors'
import { normalizePath } from '../../util/normalize-path'
import { Path } from '../../util/path'
import * as SrteUtils from '../../util/srte-utils'
import { DriveLookup, GetByPath, Types } from '..'
import { DepApiMethod, DriveApiMethods } from '../drive-api'

import { loggerIO } from '../../logging/loggerIO'
import { assertFileSize } from '../../util/fs'
import { downloadUrlToFile } from '../../util/http/downloadUrlToFile'
import * as Actions from '.'

type DepTempDir = { tempdir: string }

export type Deps =
  & DriveLookup.Deps
  & DepApiMethod<'download'>
  & Actions.DepsUpload
  & DepFs<'fstat' | 'createWriteStream' | 'rm'>
  & DepFetchClient
  & DepTempDir

// TODO add Editor interface
// TODO calc hash to check if the file was changed

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
    DriveLookup.chainCachedDocwsRoot(root => DriveLookup.getByPath(root, npath)),
    SRTE.bindTo('gbp'),
    SRTE.bind('tempfile', () => SRTE.fromReader(R.asks(tempFile))),
    SRTE.bind('handleResult', handle),
    SRTE.bind('rm', () => SRTE.asks(({ fs }) => fs.rm)),
    SRTE.bind('signal', ({ tempfile }) => SRTE.fromTask(spawnVim({ editor, tempfile }))),
    SRTE.chainW(({ tempfile, rm }) =>
      pipe(
        SRTE.fromReaderTaskEither<Deps, Error, void, DriveLookup.State>(
          assertFileSize({ path: tempfile, minimumSize: 1 }),
        ),
        SRTE.chainW(() =>
          Actions.uploadSingleFile({
            overwright: true,
            srcpath: tempfile,
            dstpath: npath,
            skipTrash: false,
          })
        ),
        SrteUtils.orElseW((e): DriveLookup.Lookup<void, Deps> =>
          FileNotFoundError.is(e)
            ? SRTE.left(err('canceled'))
            : SRTE.of(constVoid())
        ),
        SRTE.chain(() => {
          loggerIO.debug(`removing temp file ${tempfile}`)()
          return SRTE.fromTaskEither(rm(tempfile))
        }),
      )
    ),
  )
}

/** Download a file to a temp file */
const handleExistingFile = (tempfile: string, item: Types.DriveChildrenItemFile): DriveLookup.Lookup<void, Deps> => {
  return pipe(
    DriveApiMethods.getDriveItemUrl<DriveLookup.State>(item),
    SRTE.map(O.fromNullable),
    SRTE.chain(a => SRTE.fromOption(() => err(`Empty file url was returned.`))(a)),
    SRTE.chainW(url => SRTE.fromReaderTaskEither(downloadUrlToFile(url, tempfile))),
    SRTE.map(constVoid),
  )
}

const handleMeowFile = (tempfile: string): DriveLookup.Lookup<void, Deps> => {
  return pipe(
    SRTE.of(constVoid()),
  )
}

// if successful dstpath is the file to upload
// two valid cases:
// 1. file exists
// 2. we have an invalid path with a single missing item
const handle = (
  { tempfile, gbp }: { tempfile: string; gbp: GetByPath.ResultRoot },
): DriveLookup.Lookup<void, Deps> => {
  if (GetByPath.isInvalidPath(gbp)) {
    if (gbp.rest.length > 1) {
      return DriveLookup.errString(`Invalid path: ${GetByPath.pathString(gbp)}.`)
    }

    return handleMeowFile(tempfile)
  }

  if (GetByPath.isValidFolder(gbp)) {
    return DriveLookup.errString(`You cannot edit a directory.`)
  }

  if (GetByPath.isValidFile(gbp)) {
    return handleExistingFile(tempfile, gbp.file)
  }

  return gbp
}

const spawnVim = ({ tempfile, editor }: { tempfile: string; editor: string }) =>
  (): Promise<NodeJS.Signals | null> => {
    return new Promise(
      (resolve, reject) => {
        child_process
          .spawn(editor, [tempfile], {
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