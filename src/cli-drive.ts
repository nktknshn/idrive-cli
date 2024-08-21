import { pipe } from 'fp-ts/lib/function'
import * as TE from 'fp-ts/lib/TaskEither'
import { runCliAction } from './cli/cli-drive'
import { readArgv } from './cli/cli-drive/cli-drive-args'
import { createCliActionsDeps } from './cli/cli-drive/cli-drive-deps'
import { debugTimeTE } from './cli/logging'
import {
  apiLogger,
  cacheLogger,
  initLoggers,
  logger,
  printer,
  stderrLogger,
  timeLogger,
  timeLoggerIO,
} from './util/logging'

async function main() {
  const argv = readArgv()

  initLoggers(
    { debug: argv.argv.debug },
    [logger, cacheLogger, stderrLogger, apiLogger, timeLogger],
  )

  await pipe(
    createCliActionsDeps(argv.argv),
    runCliAction(argv),
    debugTimeTE('runCliAction'),
    TE.fold(printer.errorTask, printer.printTask),
  )()
}

main()
