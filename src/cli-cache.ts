import * as A from 'fp-ts/lib/Array'
import * as E from 'fp-ts/lib/Either'
import { constVoid, flow, pipe } from 'fp-ts/lib/function'
import * as J from 'fp-ts/lib/Json'
import * as NA from 'fp-ts/lib/NonEmptyArray'
import * as O from 'fp-ts/lib/Option'
import * as TE from 'fp-ts/lib/TaskEither'
import { hideBin } from 'yargs/helpers'
import yargs from 'yargs/yargs'
import { normalizePath } from './cli/actions/helpers'
import { defaultCacheFile } from './config'
import * as Cache from './icloud/drive/cache/Cache'
import * as C from './icloud/drive/cache/cachef'
import * as GetByPathResultValid from './icloud/drive/cache/GetByPathResultValid'
import { ensureNestedPath, fileName, parsePath } from './icloud/drive/helpers'
import { ensureError, err } from './lib/errors'
import { cacheLogger, logger, loggingLevels, logReturnAs, printer } from './lib/logging'

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
            Cache.Cache.tryReadFromFile(argv.cacheFile),
            TE.map(Cache.Cache.create),
          )),
        TE.map(({ cache }) =>
          pipe(
            isDrivewsid(argv.path)
              ? cache.getByIdWithPath(argv.path)
              : pipe(
                normalizePath(argv.path),
                cache.getByPathVE,
                E.fold((e) => `Error: ${e.message}`, GetByPathResultValid.showGetByPathResult),
                // logReturnAs('result'),
              ),
          )
        ),
        // TE.chain(flow(J.stringify, TE.fromEither)),
        // TE.mapLeft(ensureError),
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
