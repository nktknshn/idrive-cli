import assert from 'assert'
import { flow, pipe } from 'fp-ts/lib/function'
import * as J from 'fp-ts/lib/Json'
import * as TE from 'fp-ts/lib/TaskEither'
import { sys } from 'typescript'
import { hideBin } from 'yargs/helpers'
import yargs from 'yargs/yargs'
import { apiAction } from './cli/cli-actionF'
import { hierarchyToPath } from './cli/cli-drive-actions/helpers'
import { defaultSessionFile } from './config'
import { parseName } from './icloud/drive/helpers'
import { retrieveHierarchy } from './icloud/drive/requests'
import { ensureError, err } from './lib/errors'
import { fetchClient } from './lib/fetch-client'
import { apiLogger, cacheLogger, initLoggers, logger, loggingLevels, printer, stderrLogger } from './lib/logging'
import { isKeyOf, Path } from './lib/util'

// const actionsNames = ['retrieveHierarchy', 'retrieveItemDetails', 'retrieveItemDetailsInFolders', 'rename'] as const

// type Action = (typeof actionsNames)[number]

// const validateAction = (action: string): action is Action => (actionsNames as readonly string[]).includes(action)

function parseArgs() {
  return yargs(hideBin(process.argv))
    // .parserConfiguration({})
    .options({
      sessionFile: { alias: ['s', 'session'], default: defaultSessionFile },
      raw: { alias: 'r', default: false, type: 'boolean' },
      debug: { alias: 'd', default: false, type: 'boolean' },
    })
    .command('retrieveHierarchy [drivewsids..]', 'get h for drivewsids', _ =>
      _
        .positional('drivewsids', { type: 'string', array: true, demandOption: true })
        .options({}))
    .command('retrieveItemDetails [drivewsids..]', 'get h for drivewsids', _ =>
      _
        .positional('drivewsids', { type: 'string', array: true, demandOption: true })
        .options({}))
    .command('retrieveItemDetailsInFolders [drivewsids..]', 'get h for drivewsids', _ =>
      _
        .positional('drivewsids', { type: 'string', array: true, demandOption: true })
        .options({
          h: { type: 'boolean', default: false },
        }))
    .command('retrieveTrashDetails', 'retrieveTrashDetails', _ => _ // .positional('drivewsids', { type: 'string', array: true, demandOption: true })
      // .options({
      //   h: { type: 'boolean', default: false },
      // })
    )
    .command('rename [drivewsid] [name] [etag]', 'get h for drivewsids', _ =>
      _
        .positional('drivewsid', { type: 'string', demandOption: true })
        .positional('name', { type: 'string', demandOption: true })
        .positional('etag', { type: 'string', default: '12::34' /* demandOption: true */ })
        .options({}))
    .command('putBackItemsFromTrash [drivewsid] [etag]', 'putBackItemsFromTrash', _ =>
      _
        .positional('drivewsid', { type: 'string', demandOption: true })
        .positional('etag', { type: 'string', default: '12::34' /* demandOption: true */ })
        .options({}))
    .help()
}

const retrieveTrashDetails = (argv: {
  sessionFile: string
}) => {
  return apiAction(
    { sessionFile: argv.sessionFile },
    ({ api }) => pipe(api.retrieveTrashDetails()),
  )
}

const putBackItemsFromTrash = (argv: {
  sessionFile: string
  drivewsid: string
  etag: string
}) => {
  return apiAction(
    { sessionFile: argv.sessionFile },
    ({ api }) =>
      pipe(api.putBackItemsFromTrash([{
        drivewsid: argv.drivewsid,
        etag: argv.etag,
      }])),
  )
}

const actions = {
  retrieveHierarchy: (argv: {
    sessionFile: string
    raw: boolean
    debug: boolean
    drivewsids: string[]
  }) =>
    apiAction(
      { sessionFile: argv.sessionFile },
      ({ api, session, accountData }) =>
        pipe(
          TE.Do,
          TE.bind('hierarchy', () => api.retrieveHierarchy(argv.drivewsids)),
          TE.bind('path', ({ hierarchy }) => TE.of(hierarchyToPath(hierarchy[0].hierarchy))),
        ),
    ),
  retrieveItemDetails: (argv: {
    sessionFile: string
    raw: boolean
    debug: boolean
    drivewsids: string[]
  }) =>
    apiAction(
      { sessionFile: argv.sessionFile },
      ({ api }) =>
        pipe(
          TE.Do,
          TE.bind('details', () => api.retrieveItemsDetails(argv.drivewsids)),
          // TE.bind('path', ({ hierarchy }) => TE.of(hierarchyToPath(hierarchy[0].hierarchy))),
        ),
    ),
  retrieveItemDetailsInFolders: (argv: {
    sessionFile: string
    raw: boolean
    debug: boolean
    drivewsids: string[]
    h: boolean
  }) =>
    apiAction(
      { sessionFile: argv.sessionFile },
      ({ api }) =>
        pipe(
          TE.Do,
          TE.bind(
            'details',
            () =>
              (argv.h
                ? api.retrieveItemDetailsInFoldersHierarchies
                : api.retrieveItemDetailsInFolders)(argv.drivewsids),
          ),
          // TE.bind('path', ({ hierarchy }) => TE.of(hierarchyToPath(hierarchy[0].hierarchy))),
        ),
    ),
  rename: (argv: {
    sessionFile: string
    raw: boolean
    debug: boolean
    drivewsid: string
    name: string
    etag: string
  }) =>
    apiAction(
      { sessionFile: argv.sessionFile },
      ({ api }) =>
        pipe(
          TE.Do,
          TE.bind(
            'result',
            () =>
              api.renameItems([
                { drivewsid: argv.drivewsid, ...parseName(argv.name), etag: argv.etag },
              ]),
          ),
          // TE.bind('path', ({ hierarchy }) => TE.of(hierarchyToPath(hierarchy[0].hierarchy))),
        ),
    ),
  retrieveTrashDetails,
  putBackItemsFromTrash,
}

async function main() {
  const { argv, showHelp } = parseArgs()
  const [command] = argv._

  initLoggers(argv, [logger, cacheLogger, apiLogger, stderrLogger])

  if (!isKeyOf(actions, command)) {
    showHelp()
    sys.exit(1)
    return
  }
  // assert(typeof command === 'string' && validateAction(command))

  const te: TE.TaskEither<Error, unknown> = actions[command](argv)

  await pipe(
    te,
    TE.chain(flow(J.stringify, TE.fromEither)),
    TE.mapLeft(ensureError),
    TE.fold(printer.errorTask, printer.printTask),
  )()
  // logger.debug(argv)

  // const [command] = argv._
}

main()
