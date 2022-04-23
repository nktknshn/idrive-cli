import { flow } from 'fp-ts/lib/function'
import * as y from 'yargs'
import { hideBin } from 'yargs/helpers'
import yargs from 'yargs/yargs'
import { cacheFile, sessionFile } from '../../defaults'

const commonOptions = <T>(y: y.Argv<T>) =>
  y.options({
    sessionFile: { alias: ['s', 'session'], default: sessionFile },
    cacheFile: { alias: ['c', 'cache'], default: cacheFile },
    noCache: { alias: 'n', default: false, type: 'boolean' },
    debug: { alias: 'd', default: false, type: 'boolean' },
  })

// options(hideBin(process.argv)).argv

type CommandArgs = <T, U>(y: y.Argv<T>) => y.Argv<U>

const download = <T>(y: y.Argv<T>) =>
  y.command(
    'download <path> <dstpath>',
    'download',
    (_) =>
      _.positional('path', { type: 'string', demandOption: true })
        .options({
          output: { default: './', type: 'string' },
          structured: { default: true, type: 'boolean' },
          dry: { default: false, type: 'boolean' },
          raw: { default: true, type: 'boolean' },
          // destination: { alias: ['D'], type: 'string', demandOption: true },
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
        recursive: { alias: ['R'], default: false, type: 'boolean' },
        depth: { alias: ['D'], default: Infinity, type: 'number', demandOption: 'recursive' },
        cached: { default: false, type: 'boolean' },
      }))

const args = flow(
  commonOptions,
  ls,
  download,
)

args(yargs(hideBin(process.argv)))

export function parseArgs() {
  const y = args(yargs(hideBin(process.argv)))
    // .options({
    //   sessionFile: { alias: ['s', 'session'], default: defaultSessionFile },
    //   cacheFile: { alias: ['c', 'cache'], default: defaultCacheFile },
    //   noCache: { alias: 'n', default: false, type: 'boolean' },
    //   debug: { alias: 'd', default: false, type: 'boolean' },
    // })
    // .command<{
    //   sessionFile: string
    //   cacheFile: string
    //   noCache: boolean
    //   raw: boolean
    //   debug: boolean
    //   update: boolean
    //   fullPath: boolean
    //   listInfo: boolean
    //   header: boolean
    //   trash: boolean
    //   tree: boolean
    //   etag: boolean
    //   glob: boolean
    //   recursive: boolean
    //   depth: number
    //   cached: boolean
    // }>('ls [paths..]', 'list files in a folder', _ =>
    //   _
    //     .positional('paths', { type: 'string', array: true, default: ['/'] })
    //     .options({
    //       fullPath: { alias: ['f'], default: false, type: 'boolean' },
    //       listInfo: { alias: ['l'], default: false, type: 'boolean' },
    //       header: { alias: ['h'], default: false, type: 'boolean' },
    //       trash: { alias: ['t'], default: false, type: 'boolean' },
    //       tree: { default: false, type: 'boolean' },
    //       etag: { alias: ['e'], default: false, type: 'boolean' },
    //       glob: { default: false, type: 'boolean' },
    //       recursive: { alias: ['R'], default: false, type: 'boolean' },
    //       depth: { alias: ['D'], default: Infinity, type: 'number', demandOption: 'recursive' },
    //       cached: { default: false, type: 'boolean' },
    //     }))
    .command('mkdir <path>', 'mkdir', (_) => _.positional('path', { type: 'string', demandOption: true }))
    // .command('check', 'check updates', (_) => _.positional('path', { type: 'string', default: '/' }))
    .command(
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
    .command('cat <path>', 'cat', (_) => _.positional('path', { type: 'string', demandOption: true }))
    .command(
      'mv <srcpath> <dstpath>',
      'move',
      (_) =>
        _.positional('srcpath', { type: 'string', demandOption: true })
          .positional('dstpath', { type: 'string', demandOption: true }),
    )
    // .command(
    //   'upload <srcpath> <dstpath>',
    //   'upload',
    //   (_) =>
    //     _.positional('srcpath', { type: 'string', demandOption: true })
    //       .positional('dstpath', { type: 'string', demandOption: true })
    //       .options({
    //         overwright: { default: false, type: 'boolean' },
    //         skipTrash: { default: false, type: 'boolean' },
    //       }),
    // )
    .command(
      'upload <uploadsargs..>',
      'upload',
      (_) =>
        _.positional('uploadargs', { type: 'string', array: true, demandOption: true })
          .options({
            overwright: { default: false, type: 'boolean' },
            skipTrash: { default: false, type: 'boolean' },
          })
          .check((argv, options) => {
            const uploadargs = argv.uploadargs

            if (Array.isArray(uploadargs) && uploadargs.length < 2) {
              throw new Error(`e ti che`)
            }

            return true
          }),
    )
    .command(
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
    .command(
      'download <path> <dstpath>',
      'download',
      (_) =>
        _.positional('path', { type: 'string', demandOption: true })
          .options({
            output: { default: './', type: 'string' },
            structured: { default: true, type: 'boolean' },
            dry: { default: false, type: 'boolean' },
            raw: { default: true, type: 'boolean' },
            // destination: { alias: ['D'], type: 'string', demandOption: true },
          }),
    )
    // .command(
    //   'df <path> <dstpath>',
    //   'df',
    //   (_) =>
    //     _.positional('path', { type: 'string', demandOption: true })
    //       .positional('dstpath', { type: 'string', demandOption: true })
    //       .options({
    //         include: { default: [], type: 'string', array: false },
    //         exclude: { default: [], type: 'string', array: false },
    //         dry: { default: false, type: 'boolean' },
    //       }),
    // )
    .command(
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
    .command(
      'init',
      'init',
      a => a.options({ skipLogin: { default: false, type: 'boolean' } }),
    )
    .command(
      'edit <path>',
      'edit',
      (_) =>
        _.positional('path', { type: 'string', demandOption: true })
          .options({
            output: { default: './', type: 'string' },
            structured: { default: true, type: 'boolean' },
          }),
    )
    .help()

  return y
}
