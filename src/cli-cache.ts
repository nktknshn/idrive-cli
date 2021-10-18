import { pipe } from 'fp-ts/lib/function'
import * as TE from 'fp-ts/lib/TaskEither'
import { hideBin } from 'yargs/helpers'
import yargs from 'yargs/yargs'
import { defaultCacheFile } from './config'
import * as C from './icloud/drive/cache/cachef'
import { cacheLogger, logger, loggingLevels, printer } from './lib/logging'

function parseArgs() {
  return yargs(hideBin(process.argv))
    // .parserConfiguration({})
    .options({
      cacheFile: { alias: ['c', 'cache'], default: defaultCacheFile },
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

const isDrivewsid = (path: string) => /^([A-Z]+?)::([a-zA-Z0-9\\.]+?)::([A-Z0-9\\-]+?)$/.test(path)

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

  switch (command) {
    case 'ls':
      await pipe(
        TE.Do,
        TE.bind('cache', () =>
          pipe(
            C.Cache.tryReadFromFile(argv.cacheFile),
            TE.map(C.Cache.create),
          )),
        TE.map(({ cache }) =>
          pipe(
            isDrivewsid(argv.path)
              ? cache.getById(argv.path)
              : cache.getByPath(argv.path),
          )
        ),
        TE.fold(printer.errorTask, printer.printTask),
      )()
      break
    default:
      command && printer.error(`invalid command ${command}`)
      showHelp()
      break
  }
}

main()
