import micromatch from 'micromatch'
import { DriveLookup } from '../../../icloud-drive'
import { DriveActions } from '../../../icloud-drive'

type Args = {
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

export const download = (args: Args): DriveLookup.Lookup<string, DriveActions.DownloadRecursiveDeps> => {
  const scan = micromatch.scan(args.path)

  if (scan.isGlob) {
    args.include = [scan.input, ...args.include]
    args.path = scan.base
  }

  if (args.recursive) {
    return DriveActions.downloadRecursive(args)
  }
  else {
    return DriveActions.downloadShallow(args)
  }
}
