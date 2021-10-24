import assert from 'assert'
import { flow, pipe } from 'fp-ts/lib/function'
import * as J from 'fp-ts/lib/Json'
import * as TE from 'fp-ts/lib/TaskEither'
import { hideBin } from 'yargs/helpers'
import yargs from 'yargs/yargs'
import { apiAction } from './cli/cli-actionF'
import { defaultSessionFile } from './config'
import { hierarchyToPath } from './icloud/drive/helpers'
import { error } from './lib/errors'
import { cacheLogger, logger, loggingLevels, printer } from './lib/logging'

const actionsNames = ['retrieveHierarchy'] as const

type Action = (typeof actionsNames)[number]

const validateAction = (action: string): action is Action => (actionsNames as readonly string[]).includes(action)

function parseArgs() {
  return yargs(hideBin(process.argv))
    // .parserConfiguration({})
    .options({
      sessionFile: { alias: ['s', 'session'], default: defaultSessionFile },
      // cacheFile: { alias: ['c', 'cache'], default: defaultCacheFile },
      // noCache: { alias: 'n', default: false, type: 'boolean' },
      raw: { alias: 'r', default: false, type: 'boolean' },
      debug: { alias: 'd', default: false, type: 'boolean' },
    })
    .command('retrieveHierarchy [drivewsids..]', 'get h for drivewsids', _ =>
      _
        .positional('drivewsids', { type: 'string', array: true, demandOption: true })
        .options({}))
    .help()
}

const actions = {
  retrieveHierarchy: (argv: {
    sessionFile: string
    raw: boolean
    debug: boolean
    drivewsids: string[]
  }) =>
    pipe(
      apiAction(
        { sessionFile: argv.sessionFile },
        ({ api }) =>
          pipe(
            TE.Do,
            TE.bind('hierarchy', () => api.retrieveHierarchy(argv.drivewsids)),
            TE.bind('path', ({ hierarchy }) => TE.of(hierarchyToPath(hierarchy[0].hierarchy))),
          ),
      ),
    ),
} as const

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

  const [command] = argv._

  assert(typeof command === 'string' && validateAction(command))

  await pipe(
    actions[command](argv),
    TE.chain(flow(J.stringify, TE.fromEither)),
    TE.mapLeft((e) => error(`${e}`)),
    TE.fold(printer.errorTask, printer.printTask),
  )()
  // logger.debug(argv)

  // const [command] = argv._
}

main()
