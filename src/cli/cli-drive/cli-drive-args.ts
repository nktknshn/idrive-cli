import * as A from 'fp-ts/Array'
import { pipe } from 'fp-ts/lib/function'
import { sys } from 'typescript'
import * as y from 'yargs'
import { hideBin } from 'yargs/helpers'
import yargs from 'yargs/yargs'
import * as defaults from '../../defaults'
import { isKeyOf } from '../../util/guards'
import { printer } from '../../util/logging'

type Commands = keyof typeof commands
type CommonOptions = ReturnType<typeof commonOptions>['argv']

type ReadArgvResult = (Commands extends infer K
  ? K extends keyof typeof commands
    ? (typeof commands)[K] extends <T>(argv: y.Argv<T>) => y.Argv<infer _Argv>
      ? { command: K; argv: _Argv & CommonOptions }
    : never
  : never
  : never)

const commonOptions = <T>(y: y.Argv<T>) =>
  y.options({
    sessionFile: { alias: ['s', 'session'], default: defaults.sessionFile },
    cacheFile: { alias: ['c', 'cache'], default: defaults.cacheFile },
    noCache: { alias: 'n', default: false, type: 'boolean' },
    debug: { alias: 'd', default: false, type: 'boolean' },
  })

const download = <T>(y: y.Argv<T>) =>
  y.command(
    'download <path> <dstpath>',
    'download',
    (_) =>
      _.positional('path', { type: 'string', demandOption: true })
        .positional('dstpath', { type: 'string', demandOption: true })
        .options({
          dry: { default: false, type: 'boolean' },
          overwright: { default: false, type: 'boolean' },
          include: { default: [], type: 'string', array: true },
          exclude: { default: [], type: 'string', array: true },
          recursive: { alias: ['R'], default: false, type: 'boolean' },
          keepStructure: { alias: ['S'], default: false, type: 'boolean' },
          chunkSize: { default: defaults.downloadChunkSize, type: 'number' },
        }),
  )

const ls = <T>(y: y.Argv<T>) =>
  y.command('ls [paths..]', 'list files in a folder', _ =>
    _
      .positional('paths', { type: 'string', array: true, default: ['/'] })
      .options({
        fullPath: { alias: ['f'], default: false, type: 'boolean' },
        listInfo: { alias: ['l'], default: false, type: 'boolean' },
        header: { alias: ['h'], default: false, type: 'boolean' },
        trash: { alias: ['t'], default: false, type: 'boolean' },
        tree: { default: false, type: 'boolean' },
        etag: { alias: ['e'], default: false, type: 'boolean' },
        glob: { default: false, type: 'boolean' },
        raw: { default: false, type: 'boolean' },
        recursive: { alias: ['R'], default: false, type: 'boolean' },
        depth: { alias: ['D'], default: Infinity, type: 'number', demandOption: 'recursive' },
        cached: { default: false, type: 'boolean' },
      }))

const mkdir = <T>(y: y.Argv<T>) =>
  y.command('mkdir <path>', 'mkdir', (_) => _.positional('path', { type: 'string', demandOption: true }))

const rm = <T>(y: y.Argv<T>) =>
  y.command(
    'rm [paths..]',
    'check updates',
    (_) =>
      _.positional('paths', { type: 'string', array: true, demandOption: true })
        .options({
          skipTrash: { default: false, type: 'boolean' },
          force: { default: false, type: 'boolean' },
          recursive: { alias: ['R'], default: false, type: 'boolean' },
        }),
  )

const cat = <T>(y: y.Argv<T>) =>
  y.command('cat <path>', 'cat', (_) => _.positional('path', { type: 'string', demandOption: true }))

const mv = <T>(y: y.Argv<T>) =>
  y.command(
    'mv <srcpath> <dstpath>',
    'move',
    (_) =>
      _.positional('srcpath', { type: 'string', demandOption: true })
        .positional('dstpath', { type: 'string', demandOption: true }),
  )

const upload = <T>(y: y.Argv<T>) =>
  y.command(
    'upload <uploadargs..>',
    'upload',
    (_) =>
      _.positional('uploadargs', { type: 'string', array: true, demandOption: true })
        .options({
          overwright: { default: false, type: 'boolean' },
          skipTrash: { default: false, type: 'boolean' },
          recursive: { alias: ['R'], default: false, type: 'boolean' },

          include: { default: [], type: 'string', array: false },
          exclude: { default: [], type: 'string', array: false },
          dry: { default: false, type: 'boolean' },
          // chunkSize: { default: 2, type: 'number', implies: ['recursive'] },
        })
        .check((argv, options) => {
          const uploadargs = argv.uploadargs

          if (Array.isArray(uploadargs) && uploadargs.length < 2) {
            throw new Error(`e ti che`)
          }

          return true
        }),
  )

const autocomplete = <T>(y: y.Argv<T>) =>
  y.command(
    'autocomplete <path>',
    'autocomplete',
    (_) =>
      _.positional('path', { type: 'string', demandOption: true })
        .options({
          file: { default: false, type: 'boolean' },
          dir: { default: false, type: 'boolean' },
          trash: { default: false, type: 'boolean' },
          cached: { default: false, type: 'boolean' },
        }),
  )

const uf = <T>(y: y.Argv<T>) =>
  y.command(
    'uf <localpath> <remotepath>',
    'uf',
    (_) =>
      _.positional('localpath', { type: 'string', demandOption: true })
        .positional('remotepath', { type: 'string', demandOption: true })
        .options({
          include: { default: [], type: 'string', array: false },
          exclude: { default: [], type: 'string', array: false },
          dry: { default: false, type: 'boolean' },
          chunkSize: { default: 2, type: 'number' },
        }),
  )

const init = <T>(y: y.Argv<T>) =>
  y.command(
    'init',
    'init',
    a =>
      a.options({
        skipLogin: { default: false, type: 'boolean' },
        // auth: { default: false, type: 'boolean', description: 'auth existing' },
      }),
  )

const auth = <T>(y: y.Argv<T>) =>
  y.command(
    'auth',
    'auth session',
    a => a.options({}),
  )

const edit = <T>(y: y.Argv<T>) =>
  y.command(
    'edit <path>',
    'edit',
    (_) =>
      _.positional('path', { type: 'string', demandOption: true })
        .options({
          output: { default: './', type: 'string' },
          structured: { default: true, type: 'boolean' },
        }),
  )

const commands = {
  init,
  auth,
  download,
  ls,
  mkdir,
  edit,
  autocomplete,
  upload,
  mv,
  cat,
  rm,
}

export const readArgv = (): ReadArgvResult => {
  const y = pipe(
    Object.values(commands),
    A.reduce(
      pipe(
        yargs(hideBin(process.argv)),
        commonOptions,
      ),
      (acc, cur) => cur(acc),
    ),
  )

  const { argv, showHelp } = y
  const [command] = argv._

  if (!isKeyOf(commands, command)) {
    printer.error(`invalid command ${command}`)
    showHelp()
    sys.exit(1)
    return {} as any
  }

  return { command, argv } as ReadArgvResult
}
