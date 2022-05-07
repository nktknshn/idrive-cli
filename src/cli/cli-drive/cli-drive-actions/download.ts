import micromatch from 'micromatch'
import { DepAskConfirmation } from '../../../deps-types/DepAskConfirmation'
import { DepFetchClient } from '../../../deps-types/DepFetchClient'
import { DepFs } from '../../../deps-types/DepFs'
import { DepDriveApi, DriveQuery } from '../../../icloud-drive/drive'
import { downloadRecursive } from '../../../icloud-drive/drive/drive-action'
import { downloadShallow } from '../../../icloud-drive/drive/drive-action/actions/download/downloadShallow'
import { XXX } from '../../../util/types'

type Argv = {
  path: string
  dstpath: string
  dry: boolean
  recursive: boolean
  include: string[]
  exclude: string[]
  keepStructure: boolean
  chunkSize: number
}

type Deps =
  & DriveQuery.Deps
  & DepDriveApi<'downloadBatch'>
  & DepFetchClient
  & DepAskConfirmation
  & DepFs<
    'fstat' | 'opendir' | 'mkdir' | 'writeFile' | 'createWriteStream'
  >

export const download = (argv: Argv): XXX<DriveQuery.State, Deps, string> => {
  const scan = micromatch.scan(argv.path)

  if (scan.isGlob) {
    argv.include = [scan.input, ...argv.include]
    argv.path = scan.base
  }

  if (argv.recursive) {
    return downloadRecursive(argv)
  }
  else {
    return downloadShallow(argv)
  }
}
