import * as w from 'yargs-command-wrapper'
import * as defaults from '../../defaults'

const init = w.command(
  'init',
  'Init new session',
  a => a.options({ skipLogin: { default: false, type: 'boolean' } }),
)

const auth = w.command(
  'auth',
  'Authenticate a session',
  a => a.options({}),
)

const ls = w.command('ls [paths..]', 'List files in a folder', _ =>
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
  'Download a file or a folder content',
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

const mkdir = w.command(
  'mkdir <path>',
  'Create a folder',
  (_) => _.positional('path', { type: 'string', demandOption: true }),
)

const rm = w.command(
  'rm [paths..]',
  'Remove files and folders',
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
  'View the content of a text file',
  (_) =>
    _.positional('path', { type: 'string', demandOption: true })
      .options({
        skipValidation: { alias: 'K', default: false, type: 'boolean', description: 'Skip path validation' },
      }),
)

const edit = w.command(
  'edit <path>',
  'Edit a text file',
  (_) =>
    _.positional('path', { type: 'string', demandOption: true })
      .options({
        editor: { type: 'string', default: defaults.fileEditor },
        // unapplieable since the cache is not updated after file upload, so without validation the old file id is returned from cache
        // skipValidation: { alias: 'K', default: false, type: 'boolean', description: 'Skip path validation' },
      }),
)

const mv = w.command(
  'mv <srcpath> <dstpath>',
  'Move or rename a file or a folder',
  (_) =>
    _.positional('srcpath', { type: 'string', demandOption: true })
      .positional('dstpath', { type: 'string', demandOption: true }),
)

const upload = w.command(
  'upload <uploadargs..>',
  'Upload files and folders',
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
      .check((args) => {
        const uploadargs = args.uploadargs

        if (Array.isArray(uploadargs) && uploadargs.length < 2) {
          throw new Error('Missing destination path')
        }

        return true
      }),
)

const autocomplete = w.command(
  'autocomplete <path>',
  'Autocomplete path',
  (_) =>
    _.positional('path', { type: 'string', demandOption: true })
      .options({
        file: { default: false, type: 'boolean' },
        dir: { default: false, type: 'boolean' },
        trash: { default: false, type: 'boolean' },
        cached: { default: false, type: 'boolean' },
      }),
)

const recover = w.command(
  'recover <path>',
  'Recover a file from the trash',
  (_) => _.positional('path', { type: 'string', demandOption: true }),
)

export const cmd = w.composeCommands(
  _ =>
    _.version(defaults.cliVersion)
      .options({
        sessionFile: { alias: ['s', 'session'], default: undefined, optional: true },
        cacheFile: { alias: ['c', 'cache'], default: undefined, optional: true },
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
