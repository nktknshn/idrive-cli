import { skipValidation } from 'yargs'
import * as w from 'yargs-command-wrapper'
import * as defaults from '../../defaults'

const ls = w.command('ls [paths..]', 'list files in a folder', _ =>
  _
    .positional('paths', { type: 'string', array: true, default: ['/'] })
    .options({
      fullPath: { alias: ['f'], default: false, type: 'boolean' },
      listInfo: { alias: ['l'], default: false, type: 'boolean' },
      header: { alias: ['h'], default: false, type: 'boolean' },
      trash: { alias: ['t'], default: false, type: 'boolean' },
      tree: { default: false, type: 'boolean' },
      etag: { alias: ['e'], default: false, type: 'boolean' },
      recursive: { alias: ['R'], default: false, type: 'boolean' },
      depth: { alias: ['D'], default: Infinity, type: 'number', demandOption: 'recursive' },
      cached: { default: false, type: 'boolean' },
    }))

const download = w.command(
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

const mkdir = w.command('mkdir <path>', 'mkdir', (_) => _.positional('path', { type: 'string', demandOption: true }))

const rm = w.command(
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

const cat = w.command(
  'cat <path>',
  'cat',
  (_) =>
    _.positional('path', { type: 'string', demandOption: true })
      .options({
        skipValidation: { alias: 'K', default: false, type: 'boolean', description: 'Skip path validation' },
      }),
)

const mv = w.command(
  'mv <srcpath> <dstpath>',
  'move',
  (_) =>
    _.positional('srcpath', { type: 'string', demandOption: true })
      .positional('dstpath', { type: 'string', demandOption: true }),
)

const upload = w.command(
  'upload <uploadargs..>',
  'upload',
  (_) =>
    _.positional('uploadargs', { type: 'string', array: true, demandOption: true })
      .options({
        overwright: { default: false, type: 'boolean' },
        skipTrash: { default: false, type: 'boolean' },
        recursive: { alias: ['R'], default: false, type: 'boolean' },

        include: { default: [], type: 'string', array: true },
        exclude: { default: [], type: 'string', array: true },
        dry: { default: false, type: 'boolean' },
        // chunkSize: { default: 2, type: 'number', implies: ['recursive'] },
      })
      .check((argv) => {
        const uploadargs = argv.uploadargs

        if (Array.isArray(uploadargs) && uploadargs.length < 2) {
          throw new Error('Missing destination path')
        }

        return true
      }),
)

const autocomplete = w.command(
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

const init = w.command(
  'init',
  'init',
  a => a.options({ skipLogin: { default: false, type: 'boolean' } }),
)

const auth = w.command(
  'auth',
  'auth session',
  a => a.options({}),
)

const edit = w.command(
  'edit <path>',
  'edit',
  (_) =>
    _.positional('path', { type: 'string', demandOption: true })
      .options({
        editor: { type: 'string', default: defaults.fileEditor },
      }),
)

const recover = w.command(
  'recover <path>',
  'recover',
  (_) => _.positional('path', { type: 'string', demandOption: true }),
)

export const cmd = w.composeCommands(
  _ =>
    _.options({
      sessionFile: { alias: ['s', 'session'], default: defaults.sessionFile },
      cacheFile: { alias: ['c', 'cache'], default: defaults.cacheFile },
      noCache: { alias: 'n', default: false, type: 'boolean', description: 'Disable cache' },
      debug: { alias: 'd', default: false, type: 'boolean' },
    }),
  init,
  auth,
  ls,
  download,
  mkdir,
  edit,
  autocomplete,
  upload,
  mv,
  cat,
  rm,
  recover,
)

export type CliCommands = w.GetCommandArgs<typeof cmd>
