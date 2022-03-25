import { pipe } from 'fp-ts/lib/function'
import * as TE from 'fp-ts/lib/TaskEither'
import { sys } from 'typescript'
import { cliActionsDeps, isValidAction, runCliAction } from './cli/cli-drive'
import { parseArgs } from './cli/cli-drive/cli-drive-args'
import { apiLogger, cacheLogger, initLoggers, logger, printer, stderrLogger } from './lib/logging'

async function main() {
  const { argv, showHelp } = parseArgs()
  const [action] = argv._

  initLoggers(
    { debug: argv.debug },
    [
      logger,
      cacheLogger,
      stderrLogger,
      apiLogger,
    ],
  )

  if (!isValidAction(action)) {
    printer.error(`invalid action ${action}`)
    showHelp()
    sys.exit(1)
    return
  }

  await pipe(
    cliActionsDeps(argv),
    runCliAction(action)(argv),
    TE.fold(printer.errorTask, printer.printTask),
  )()
}

main()
