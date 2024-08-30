import assert from 'assert'
import * as A from 'fp-ts/Array'
import * as TE from 'fp-ts/lib/TaskEither'

import { DriveLookup } from '..'
import { Deps as UploadFolderDeps, uploadFolder } from './upload/upload-folder'
import { Deps as UploadDeps, uploadMany, uploadSingleFile } from './upload/uploads'

export type AskingFunc = (({ message }: { message: string }) => TE.TaskEither<Error, boolean>)

export const upload = (
  args: {
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
  assert(A.isNonEmpty(args.uploadargs))
  assert(args.uploadargs.length > 1)

  if (args.recursive) {
    return uploadFolder({
      ...args,
      localpath: args.uploadargs[0],
      remotepath: args.uploadargs[1],
      chunkSize: 2,
    })
  }

  if (args.uploadargs.length == 2) {
    return uploadSingleFile({
      overwright: args.overwright,
      skipTrash: args.skipTrash,
      srcpath: args.uploadargs[0],
      dstpath: args.uploadargs[1],
    })
  }
  else {
    return uploadMany({
      uploadargs: args.uploadargs,
      overwright: args.overwright,
      skipTrash: args.skipTrash,
    })
  }
}
