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
      cached: { default: false, type: 'boolean', description: 'Only list cached items' },
      'full-path': { alias: ['f'], default: false, type: 'boolean', description: 'Print full paths' },
      long: { alias: ['l'], default: false, description: 'Use a long listing format' },
      recursive: { alias: ['R'], default: false, type: 'boolean', description: 'Recursive listing' },
      depth: { alias: ['D'], default: Infinity, type: 'number', description: 'Depth of recursive listing' },
      tree: { default: false, type: 'boolean', description: 'Print tree view' },
      info: { alias: ['i'], default: false, type: 'boolean', description: 'Include folder info in listing' },
      'human-readable': {
        alias: ['h'],
        default: false,
        type: 'boolean',
        description: 'With -l, print sizes like 1K 234M 2G etc.',
      },
      // etag: { alias: ['e'], default: false, type: 'boolean' },
      trash: { alias: ['trash'], default: false, type: 'boolean', description: 'List trash' },
      // TODO
      sort: {
        alias: ['S'],
        choices: ['name', 'size'],
        default: 'name',
        type: 'string',
        description: 'Sort by',
      },
    })
    .coerce('sort', (a): 'name' | 'size' => {
      if (['name', 'size'].includes(a)) {
        return a
      }

      throw new Error(`Invalid sort option: ${a}`)
    })
    .count('long')
    .check((args) => {
      if (args.depth < 0) {
        throw new Error('Depth must be positive')
      }

      if (args.tree && !args.recursive) {
        throw new Error('Tree view requires recursive listing')
      }

      // if (args.depth > 0 && args.depth < Infinity && !args.recursive) {
      //   throw new Error('Depth requires recursive listing')
      // }

      return true
    }))

const download = w.command(
  'download <path> <dstpath>',
  'Download a file or a folder',
  (_) =>
    _.positional('path', { type: 'string', demandOption: true })
      .positional('dstpath', { type: 'string', demandOption: true })
      .options({
        dry: { default: false, type: 'boolean' },
        overwright: { default: false, type: 'boolean' },
        include: { default: [], type: 'string', array: true },
        exclude: { default: [], type: 'string', array: true },
        recursive: { alias: ['R'], default: false, type: 'boolean' },
        'keep-structure': {
          alias: ['S'],
          default: false,
          type: 'boolean',
          description: 'Keep the remote folder structure',
        },
        'chunk-size': { default: defaults.downloadChunkSize, type: 'number', description: 'Chunk size' },
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
        'skip-trash': { default: false, type: 'boolean', description: 'Skip trash' },
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
        'skip-validation': { alias: 'K', default: false, type: 'boolean', description: 'Skip path validation' },
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
        'skip-trash': { default: false, type: 'boolean' },
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
      .scriptName('idrive')
      .options({
        'session-file': {
          alias: ['s'],
          default: undefined,
          optional: true,
          description: 'Session file',
        },
        'cache-file': {
          alias: ['c'],
          default: undefined,
          optional: true,
          description: 'Cache file',
        },
        'no-cache': { alias: 'n', default: false, type: 'boolean', description: 'Disable cache' },
        debug: { alias: 'd', default: false, type: 'boolean' },
      }),
  init,
  auth,
  ls,
  mkdir,
  cat,
  edit,
  mv,
  rm,
  download,
  upload,
  recover,
  autocomplete,
)

export type CliCommands = w.GetCommandArgs<typeof cmd>
