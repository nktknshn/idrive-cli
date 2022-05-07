import * as E from 'fp-ts/lib/Either'
import { pipe } from 'fp-ts/lib/function'
import * as RTE from 'fp-ts/lib/ReaderTaskEither'
import * as TE from 'fp-ts/lib/TaskEither'
import { hideBin } from 'yargs/helpers'
import yargs from 'yargs/yargs'
import { cacheFile } from './defaults'
import * as C from './icloud-drive/drive-lookup/cache/cache'
import * as trySaveFile from './icloud-drive/drive-lookup/cache/cache-file'
import * as GetByPathResultValid from './icloud-drive/util/get-by-path-types'
import * as fs from './util/fs'
import { cacheLogger, logger, loggingLevels, printer } from './util/logging'
import { normalizePath } from './util/normalize-path'

function parseArgs() {
  return yargs(hideBin(process.argv))
    // .parserConfiguration({})
    .options({
      cacheFile: { alias: ['c', 'cache'], default: cacheFile },
      raw: { alias: 'r', default: false, type: 'boolean' },
      debug: { alias: 'd', default: false, type: 'boolean' },
    })
    .command('ls [path]', 'list files in a folder', _ =>
      _
        .positional('path', { type: 'string', default: '/' })
        .options({
          fullPath: { alias: ['f'], default: false, type: 'boolean' },
          recursive: { alias: ['R'], default: false, type: 'boolean' },
          depth: { alias: ['D'], default: 0, type: 'number', demandOption: 'recursive' },
        }) // .options({ short: { alias: ['h'], default: false, type: 'boolean' } })
    )
    .help()
}

const isDrivewsid = (path: string) => /^([A-Z]+?)::([a-zA-Z0-9\\.]+?)::([a-zA-Z0-9\\-]+?)$/.test(path)

async function main() {
  const { argv, showHelp } = parseArgs()

  logger.add(
    argv.debug
      ? loggingLevels.debug
      : loggingLevels.info,
  )

  cacheLogger.add(
    loggingLevels.info,
  )

  // logger.debug(argv)

  const [command] = argv._

  const ls = pipe(
    RTE.Do,
    RTE.bind('cache', () =>
      pipe(
        trySaveFile.tryReadFromFile(argv.cacheFile),
      )),
    RTE.bind('root', ({ cache }) => RTE.fromEither(C.getDocwsRoot(cache))),
    RTE.map(({ cache, root }) =>
      pipe(
        isDrivewsid(argv.path)
          ? C.getByIdWithPath(argv.path)(cache)
          : pipe(
            C.getByPath(root.content, normalizePath(argv.path))(cache),
            // E.fold((e) => `Error: ${e.message}`, GetByPathResultValid.showGetByPathResult),
            // logReturnAs('result'),
          ),
      )
    ),
    // TE.chain(flow(J.stringify, TE.fromEither)),
    // TE.mapLeft(ensureError),
    RTE.match(printer.error, printer.print),
  )

  switch (command) {
    case 'ls':
      await ls({ fs })()
      break
    default:
      command && printer.error(`invalid command ${command}`)
      showHelp()
      break
  }
}

main()
