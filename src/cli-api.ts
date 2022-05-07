import { flow, pipe } from 'fp-ts/lib/function'
import * as J from 'fp-ts/lib/Json'
import * as TE from 'fp-ts/lib/TaskEither'
import { sys } from 'typescript'
import {
  putBackItemsFromTrash,
  rename,
  // retrieveHierarchy,
  // retrieveItemDetails,
  retrieveItemDetailsInFolders,
  retrieveTrashDetails,
} from './cli/cli-api/cli-api-actions'
import { parseArgs } from './cli/cli-trash/cli-trash-args'
import * as defaults from './defaults'
import * as deps from './deps-providers'
import { ensureError } from './util/errors'
import { isKeyOf } from './util/guards'
import { apiLogger, cacheLogger, initLoggers, logger, printer, stderrLogger } from './util/logging'

const actions = {
  // retrieveHierarchy,
  // retrieveItemDetails,
  retrieveItemDetailsInFolders,
  // rename,
  // retrieveTrashDetails,
  // putBackItemsFromTrash,
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

  await pipe(
    actions[command](argv)({
      fetchClient: deps.fetchClient,
      fs: deps.fs,
      api: deps.api,
      sessionFile: argv.sessionFile ?? defaults.sessionFile,
    }),
    TE.chain(flow(J.stringify, TE.fromEither)),
    TE.mapLeft(ensureError),
    TE.fold(printer.errorTask, printer.printTask),
  )()
}

main()
