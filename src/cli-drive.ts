import { pipe } from 'fp-ts/lib/function'
import * as TE from 'fp-ts/lib/TaskEither'
import { sys } from 'typescript'
import { parseArgs } from './cli-drive-args'
import * as AS from './cli/cli-drive-actions'
import { apiLogger, cacheLogger, initLoggers, logger, printer, stderrLogger } from './lib/logging'
import { isKeyOf } from './lib/util'

const commands = {
  ls: AS.listUnixPath,
  mkdir: AS.mkdir,
  rm: AS.rm,
  upload: AS.upload,
  mv: AS.move,
}

async function main() {
  const { argv, showHelp } = parseArgs()
  const [command] = argv._

  initLoggers({ debug: argv.debug }, [logger, cacheLogger, stderrLogger, apiLogger])

  if (!isKeyOf(commands, command)) {
    printer.error(`invalid command ${command}`)
    showHelp()
    sys.exit(1)
    return
  }

  pipe(
    commands[command](argv),
    TE.fold(printer.errorTask, printer.printTask),
  )
}

main()
