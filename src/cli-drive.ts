import * as E from 'fp-ts/lib/Either'
import { pipe } from 'fp-ts/lib/function'
import * as TE from 'fp-ts/lib/TaskEither'

import * as w from 'yargs-command-wrapper'
import { runCliAction as runCliCommand } from './cli/cli-drive'
import { cmd } from './cli/cli-drive/args'
import { createCliActionsDeps as createCliCommandsDeps } from './cli/cli-drive/deps'
import { debugTimeTE } from './logging/debug-time'
import { apiLogger, cacheLogger, initLoggers, logger, stderrLogger, timeLogger } from './logging/logging'
import { printer } from './logging/printerIO'

async function main() {
  const { result, yargs } = pipe(
    () => w.buildAndParse(cmd),
  )()

  if (E.isLeft(result)) {
    console.log(result.left.message)
    yargs.showHelp('log')
    process.exit(0)
  }

  const command = result.right

  initLoggers(
    { debug: command.argv.debug },
    [logger, cacheLogger, stderrLogger, apiLogger, timeLogger],
  )

  await pipe(
    createCliCommandsDeps(command.argv),
    runCliCommand(command),
    debugTimeTE('runCliCommand'),
    TE.fold(printer.errorTask, printer.printTask),
  )()
}

main()
