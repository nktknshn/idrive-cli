import micromatch from 'micromatch'
import { DepAskConfirmation } from '../../../deps-types/DepAskConfirmation'
import { DepFetchClient } from '../../../deps-types/DepFetchClient'
import { DepFs } from '../../../deps-types/DepFs'
import { DriveApi, DriveLookup } from '../../../icloud-drive'
import { downloadShallow } from '../../../icloud-drive/actions/download/downloadShallow'
import { downloadRecursive } from '../../../icloud-drive/drive-action'
import { XXX } from '../../../util/types'

type Argv = {
  path: string
  dstpath: string
  dry: boolean
  recursive: boolean
  overwright: boolean
  include: string[]
  exclude: string[]
  keepStructure: boolean
  chunkSize: number
}

type Deps =
  & DriveLookup.Deps
  & DriveApi.Dep<'downloadBatch'>
  & DepFetchClient
  & DepAskConfirmation
  & DepFs<
    'fstat' | 'opendir' | 'mkdir' | 'writeFile' | 'createWriteStream'
  >

export const download = (argv: Argv): XXX<DriveLookup.State, Deps, string> => {
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
