import micromatch from 'micromatch'
import { DriveLookup } from '../../../icloud-drive'
import { DriveActions } from '../../../icloud-drive'

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

export const download = (argv: Argv): DriveLookup.Lookup<string, DriveActions.DownloadRecursiveDeps> => {
  const scan = micromatch.scan(argv.path)

  if (scan.isGlob) {
    argv.include = [scan.input, ...argv.include]
    argv.path = scan.base
  }

  if (argv.recursive) {
    return DriveActions.downloadRecursive(argv)
  }
  else {
    return DriveActions.downloadShallow(argv)
  }
}
