import { pipe } from 'fp-ts/lib/function'
import * as TE from 'fp-ts/lib/TaskEither'
import { sys } from 'typescript'
import { isValidCommand, runCommand } from './cli/cli-drive'
import { parseArgs } from './cli/cli-drive/cli-drive-args'
import { apiLogger, cacheLogger, initLoggers, logger, printer, stderrLogger } from './lib/logging'

async function main() {
  const { argv, showHelp } = parseArgs()
  const [command] = argv._

  initLoggers(
    { debug: argv.debug },
    [
      logger,
      cacheLogger,
      stderrLogger,
      apiLogger,
    ],
  )

  if (!(typeof command === 'string' && isValidCommand(command))) {
    printer.error(`invalid command ${command}`)
    showHelp()
    sys.exit(1)
    return
  }

  await pipe(
    runCommand(command)(argv),
    TE.fold(printer.errorTask, printer.printTask),
  )()
}

main()
