import { flow, pipe } from 'fp-ts/lib/function'
import * as J from 'fp-ts/lib/Json'
import * as TE from 'fp-ts/lib/TaskEither'
import { sys } from 'typescript'
import { apiActionM } from './cli/api-action'
import { hierarchyToPath } from './cli/cli-drive/cli-drive-actions/helpers'
import { parseArgs } from './cli/cli-trash/cli-trash-args'
import { parseName } from './icloud/drive/helpers'
import { ensureError } from './lib/errors'
import { apiLogger, cacheLogger, initLoggers, logger, printer, stderrLogger } from './lib/logging'
import { isKeyOf } from './lib/util'

const retrieveTrashDetails = (argv: {
  sessionFile: string
}) => {
  return apiActionM(
    ({ api }) => pipe(api.retrieveTrashDetails()),
  )({ sessionFile: argv.sessionFile })
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

const rename = (argv: {
  sessionFile: string
  raw: boolean
  debug: boolean
  drivewsid: string
  name: string
  etag: string
}) =>
  apiActionM(
    ({ api }) =>
      pipe(
        api.renameItems([
          { drivewsid: argv.drivewsid, ...parseName(argv.name), etag: argv.etag },
        ]),
      ),
  )({ sessionFile: argv.sessionFile })

const retrieveItemDetailsInFolders = (argv: {
  sessionFile: string
  raw: boolean
  debug: boolean
  drivewsids: string[]
  h: boolean
}) =>
  apiActionM(
    ({ api }) =>
      pipe(
        (argv.h
          ? api.retrieveItemDetailsInFoldersHierarchies
          : api.retrieveItemDetailsInFolders)(argv.drivewsids),
      ),
  )({ sessionFile: argv.sessionFile })

const retrieveItemDetails = (argv: {
  sessionFile: string
  raw: boolean
  debug: boolean
  drivewsids: string[]
}) =>
  apiActionM(
    ({ api }) =>
      pipe(
        api.retrieveItemsDetails(argv.drivewsids),
      ),
  )({ sessionFile: argv.sessionFile })

const retrieveHierarchy = (argv: {
  sessionFile: string
  raw: boolean
  debug: boolean
  drivewsids: string[]
}) =>
  apiActionM(
    ({ api, session, accountData }) =>
      pipe(
        TE.Do,
        TE.bind('hierarchy', () => api.retrieveHierarchy(argv.drivewsids)),
        TE.bind('path', ({ hierarchy }) => TE.of(hierarchyToPath(hierarchy[0].hierarchy))),
      ),
  )({ sessionFile: argv.sessionFile })

const actions = {
  retrieveHierarchy,
  retrieveItemDetails,
  retrieveItemDetailsInFolders,
  rename,
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

  const te: TE.TaskEither<Error, unknown> = actions[command](argv)

  await pipe(
    te,
    TE.chain(flow(J.stringify, TE.fromEither)),
    TE.mapLeft(ensureError),
    TE.fold(printer.errorTask, printer.printTask),
  )()
}

main()
