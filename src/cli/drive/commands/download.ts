import micromatch from 'micromatch'
import { DepAskConfirmation } from '../../../deps-types/dep-ask-confirmation'
import { DepFetchClient } from '../../../deps-types/dep-fetch-client'
import { DepFs } from '../../../deps-types/dep-fs'
import { DriveLookup } from '../../../icloud-drive'
import { downloadShallow } from '../../../icloud-drive/actions/download/downloadShallow'
import { downloadRecursive } from '../../../icloud-drive/drive-action'
import { DepApiMethod } from '../../../icloud-drive/drive-api'
import { SRA } from '../../../util/types'

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
  & DepApiMethod<'downloadBatch'>
  & DepFetchClient
  & DepAskConfirmation
  & DepFs<
    'fstat' | 'opendir' | 'mkdir' | 'writeFile' | 'createWriteStream'
  >

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

export const download = (argv: Argv): SRA<DriveLookup.LookupState, Deps, string> => {
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
