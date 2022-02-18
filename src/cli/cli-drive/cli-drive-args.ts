import { hideBin } from 'yargs/helpers'
import yargs from 'yargs/yargs'
import { defaultCacheFile, defaultSessionFile } from '../../config'

export function parseArgs() {
  return yargs(hideBin(process.argv))
    .options({
      sessionFile: { alias: ['s', 'session'], default: defaultSessionFile },
      cacheFile: { alias: ['c', 'cache'], default: defaultCacheFile },
      noCache: { alias: 'n', default: false, type: 'boolean' },
      raw: { alias: 'r', default: false, type: 'boolean' },
      debug: { alias: 'd', default: false, type: 'boolean' },
      update: { alias: 'u', default: false, type: 'boolean' },
    })
    .command('ls [paths..]', 'list files in a folder', _ =>
      _
        .positional('paths', { type: 'string', array: true, default: ['/'] })
        .options({
          fullPath: { alias: ['f'], default: false, type: 'boolean' },
          listInfo: { alias: ['l'], default: false, type: 'boolean' },
          header: { alias: ['h'], default: false, type: 'boolean' },
          trash: { alias: ['t'], default: false, type: 'boolean' },
          etag: { alias: ['e'], default: false, type: 'boolean' },
          recursive: { alias: ['R'], default: false, type: 'boolean' },
          depth: { alias: ['D'], default: 0, type: 'number', demandOption: 'recursive' },
          cached: { default: false, type: 'boolean' },
        }))
    // .command('update [path]', 'update cache', _ =>
    //   _
    //     .positional('path', { type: 'string', default: '/' })
    //     .options({
    //       fullPath: { alias: ['f'], default: false, type: 'boolean' },
    //       recursive: { alias: ['R'], default: false, type: 'boolean' },
    //       depth: { alias: ['D'], default: 0, type: 'number', demandOption: 'recursive' },
    //     }))
    .command('mkdir <path>', 'mkdir', (_) => _.positional('path', { type: 'string', demandOption: true }))
    // .command('check', 'check updates', (_) => _.positional('path', { type: 'string', default: '/' }))
    .command(
      'rm [paths..]',
      'check updates',
      (_) =>
        _.positional('paths', { type: 'string', array: true, demandOption: true })
          .options({
            trash: { alias: ['t'], default: true, type: 'boolean' },
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
    .command(
      'upload <srcpath> <dstpath>',
      'upload',
      (_) =>
        _.positional('srcpath', { type: 'string', demandOption: true })
          .positional('dstpath', { type: 'string', demandOption: true })
          .options({
            overwright: { default: false, type: 'boolean' },
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
      'recover <path>',
      'recover',
      (_) => _.positional('path', { type: 'string', demandOption: true }),
    )
    .help()
}
