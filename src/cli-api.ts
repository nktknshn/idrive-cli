import assert from 'assert'
import { flow, pipe } from 'fp-ts/lib/function'
import * as J from 'fp-ts/lib/Json'
import * as TE from 'fp-ts/lib/TaskEither'
import { sys } from 'typescript'
import { apiAction, apiActionM } from './cli/cli-actionF'
import { hierarchyToPath } from './cli/cli-drive/cli-drive-actions/helpers'
import { parseArgs } from './cli/cli-trash/cli-trash-args'
import { parseName } from './icloud/drive/helpers'
import { retrieveHierarchy } from './icloud/drive/requests'
import { ensureError, err } from './lib/errors'
import { fetchClient } from './lib/http/fetch-client'
import { apiLogger, cacheLogger, initLoggers, logger, loggingLevels, printer, stderrLogger } from './lib/logging'
import { isKeyOf, Path } from './lib/util'

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
  return pipe(
    { sessionFile: argv.sessionFile },
    apiActionM(
      ({ api }) =>
        pipe(api.putBackItemsFromTrash([{
          drivewsid: argv.drivewsid,
          etag: argv.etag,
        }])),
    ),
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
