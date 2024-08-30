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

/*
Download a file or a folder content.

A single file

`idrive download '/Obsidian/my1/note1.md' ./outputdir`

Recursively download folders' shallow content into `./outputdir/my1/`

`idrive download '/Obsidian/my1/*.md' ./outputdir`

Recursively download all `md` files into `./outputdir/diary/`

`idrive download -R '/Obsidian/my1/' ./outputdir`

Download download all into `./outputdir/Obsidian/my1/diary/`

`idrive download -R '/Obsidian/my1/diary/** /*.md' ./outputdir`

`idrive download -RS '/Obsidian/my1/diary/** /*.md' ./outputdir`

Use `dry` flag to only check what is going to be downloaded

` include` and `exclude` flags are also supported


*/

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
