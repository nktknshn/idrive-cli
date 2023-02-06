import { pipe } from 'fp-ts/lib/function'
import * as TE from 'fp-ts/lib/TaskEither'
import { runCliAction } from './cli/cli-drive'
import { readArgv } from './cli/cli-drive/cli-drive-args'
import { createCliActionsDeps } from './cli/cli-drive/cli-drive-deps'
import { apiLogger, cacheLogger, initLoggers, logger, printer, stderrLogger } from './util/logging'

async function main() {
  const argv = readArgv()

  initLoggers(
    { debug: argv.argv.debug },
    [
      logger,
      cacheLogger,
      stderrLogger,
      apiLogger,
    ],
  )

  await pipe(
    createCliActionsDeps(argv.argv),
    runCliAction(argv),
    TE.fold(printer.errorTask, printer.printTask),
  )()
}

main()
