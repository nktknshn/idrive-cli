import * as A from 'fp-ts/lib/Array'
import { pipe } from 'fp-ts/lib/function'
import * as NA from 'fp-ts/lib/NonEmptyArray'
import * as SRTE from 'fp-ts/lib/StateReaderTaskEither'
import * as O from 'fp-ts/Option'
import { DriveActions, DriveLookup, DriveTree } from '../../../icloud-drive'
import { addLeadingSlash } from '../../../util/normalize-path'
import { Path } from '../../../util/path'
import { addTrailingNewline } from '../../../util/string'
import * as LsPrinting from './ls-printing/printing'

type Args = {
  paths: string[]
  'full-path': boolean
  long: number
  info: boolean
  'human-readable': boolean
  trash: boolean
  tree: boolean
  recursive: boolean
  depth: number
  cached: boolean
}

export const ls = (
  args: Args,
): DriveLookup.Lookup<string> => {
  if (!A.isNonEmpty(args.paths)) {
    return DriveLookup.errString('no paths')
  }

  args.paths = pipe(args.paths, A.map(addLeadingSlash))

  if (args.recursive && args.tree) {
    return lsRecursiveTree(args)
  }

  if (args.recursive) {
    return lsRecursive(args)
  }

  return lsShallow(args)
}

// TODO show other dates for files
/** List a folder with zero depth */
const lsShallow = (
  args: Args,
): DriveLookup.Lookup<string> => {
  if (!A.isNonEmpty(args.paths)) {
    return DriveLookup.errString('no paths')
  }

  const opts = {
    showInfo: args.info,
    long: args.long,
    fullPath: args['full-path'],
    humanReadable: args['human-readable'],
  }

  return pipe(
    DriveActions.listPaths({ paths: args.paths, trash: args.trash, cached: args.cached }),
    SRTE.map(NA.map(a =>
      a.valid
        ? LsPrinting.showValidPath(a)({ ...args, ...opts })
        : LsPrinting.showInvalidPath(a.validation) + '\n'
    )),
    SRTE.map(NA.zip(args.paths)),
    SRTE.map(res =>
      res.length > 1
        // if multiple paths, zip the results with the paths
        ? pipe(res, NA.map(([res, path]) => `${path}:\n${res}`))
        : // just show the first item without the path
          [res[0][0]]
    ),
    SRTE.map(_ => _.join('\n')),
    SRTE.map(addTrailingNewline),
  )
}

const lsRecursive = (
  args: Args,
): DriveLookup.Lookup<string> => {
  if (!A.isNonEmpty(args.paths)) {
    return DriveLookup.errString('no paths')
  }

  return pipe(
    DriveActions.listRecursive({ paths: args.paths, depth: args.depth }),
    SRTE.map(NA.zip(args.paths)),
    SRTE.map(NA.map(([res, path]) => {
      let result = ''
      for (const item of res) {
        // const row = LsPrinting.showItem(
        //   item.item,
        //   path,
        //   10,
        //   10,
        //   10,
        //   { fullPath: true, long: 0, header: false },
        // )
      }
    })),
    // SRTE.map(NA.map(([res, path]) => `${path}:\n${res.map(_ => _.path).join('\n')}`)),
    SRTE.map(_ => _.join('\n\n')),
  )
}

/** Output as tree */
const lsRecursiveTree = (
  args: Args,
): DriveLookup.Lookup<string> => {
  if (!A.isNonEmpty(args.paths)) {
    return DriveLookup.errString('no paths')
  }

  return pipe(
    DriveActions.listRecursiveTree({ paths: args.paths, depth: args.depth }),
    SRTE.map(NA.zip(args.paths)),
    SRTE.map(NA.map(([tree, path]) =>
      pipe(
        tree,
        O.fold(
          () => Path.dirname(path) + '/',
          DriveTree.showTreeWithFiles,
        ),
      )
    )),
    SRTE.map(_ => _.join('\n\n')),
  )
}
