import assert from 'assert'
import * as A from 'fp-ts/Array'
import * as TE from 'fp-ts/lib/TaskEither'
import { DriveApi, DriveLookup } from '../../../icloud-drive'

import { NEA, SRA } from '../../../util/types'
import { Deps as UploadFolderDeps, uploadFolder } from './upload-folder'
import { Deps as UploadDeps, uploads, uploadSingleFile } from './upload/uploads'

export type AskingFunc = (({ message }: { message: string }) => TE.TaskEither<Error, boolean>)

/*

`upload ~/Documents/note1.md /Obsidian/my1/notes/`

`upload ~/Documents/note1.md /Obsidian/my1/notes/note.md`

`upload ~/Documents/note1.md ~/Documents/note2.md ~/Documents/note3.md /Obsidian/my1/notes/`

`upload -R ~/Documents/ /Obsidian/my1/notes/`

`upload -R '~/Documents/** /*.md' /Obsidian/my1/notes/`

*/
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
): SRA<DriveLookup.LookupState, UploadDeps & UploadFolderDeps, unknown> => {
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
