import { flow, pipe } from 'fp-ts/lib/function'
import * as J from 'fp-ts/lib/Json'
import * as TE from 'fp-ts/lib/TaskEither'
import { sys } from 'typescript'
import {
  putBackItemsFromTrash,
  rename,
  retrieveHierarchy,
  retrieveItemDetails,
  retrieveItemDetailsInFolders,
  retrieveTrashDetails,
} from './cli/cli-api/cli-api-actions'
import { parseArgs } from './cli/cli-trash/cli-trash-args'
import { ensureError } from './lib/errors'
import { apiLogger, cacheLogger, initLoggers, logger, printer, stderrLogger } from './lib/logging'
import { isKeyOf } from './lib/util'

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

  await pipe(
    <TE.TaskEither<Error, unknown>> actions[command](argv),
    TE.chain(flow(J.stringify, TE.fromEither)),
    TE.mapLeft(ensureError),
    TE.fold(printer.errorTask, printer.printTask),
  )()
}

main()
