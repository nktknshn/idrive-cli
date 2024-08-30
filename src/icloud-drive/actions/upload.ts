import assert from 'assert'
import * as A from 'fp-ts/Array'
import * as TE from 'fp-ts/lib/TaskEither'

import { DriveLookup } from '..'
import { Deps as UploadFolderDeps, uploadFolder } from './upload-folder'
import { Deps as UploadDeps, uploads, uploadSingleFile } from './upload/uploads'

export type AskingFunc = (({ message }: { message: string }) => TE.TaskEither<Error, boolean>)

export const upload = (
  argv: {
    uploadargs: string[]
    recursive: boolean
    dry: boolean
    include: string[]
    exclude: string[]
    // chunkSize: number
    overwright: boolean
    skipTrash: boolean
  },
): DriveLookup.Lookup<unknown, UploadDeps & UploadFolderDeps> => {
  assert(A.isNonEmpty(argv.uploadargs))
  assert(argv.uploadargs.length > 1)

  if (argv.recursive) {
    return uploadFolder({
      ...argv,
      localpath: argv.uploadargs[0],
      remotepath: argv.uploadargs[1],
      chunkSize: 2,
    })
  }

  if (argv.uploadargs.length == 2) {
    return uploadSingleFile({
      overwright: argv.overwright,
      skipTrash: argv.skipTrash,
      srcpath: argv.uploadargs[0],
      dstpath: argv.uploadargs[1],
    })
  }
  else {
    return uploads({
      uploadargs: argv.uploadargs,
      overwright: argv.overwright,
      skipTrash: argv.skipTrash,
    })
  }
}
