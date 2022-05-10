import { pipe } from 'fp-ts/lib/function'
import * as TE from 'fp-ts/lib/TaskEither'
import { runCliAction } from './cli/cli-drive'
import { readArgv } from './cli/cli-drive/cli-drive-args'
import { createCliActionsDeps } from './cli/cli-drive/cli-drive-deps'
import { getCode } from './deps-providers/getCode'
import { apiLogger, cacheLogger, initLoggers, logger, printer, stderrLogger } from './util/logging'

async function main() {
  // const { argv, showHelp } = parseArgs()
  // const [action] = argv._
  const t = readArgv()

  initLoggers(
    { debug: t.argv.debug },
    [
      logger,
      cacheLogger,
      stderrLogger,
      apiLogger,
    ],
  )

  await pipe(
    // getCode(),
    createCliActionsDeps(t.argv),
    runCliAction(t),
    TE.fold(printer.errorTask, printer.printTask),
  )()

  // if (!isValidAction(action)) {
  //   printer.error(`invalid action ${action}`)
  //   showHelp()
  //   sys.exit(1)
  //   return
  // }
  // await pipe(
  //   cliActionsDeps(argv),
  //   runCliAction(action)(argv),
  //   TE.fold(printer.errorTask, printer.printTask),
  // )()
}

main()
