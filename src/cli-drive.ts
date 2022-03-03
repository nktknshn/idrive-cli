import { pipe } from 'fp-ts/lib/function'
import * as SRTE from 'fp-ts/lib/StateReaderTaskEither'
import * as TE from 'fp-ts/lib/TaskEither'
import { sys } from 'typescript'
import { cliActionM2 } from './cli/cli-action'
import * as Action from './cli/cli-drive/cli-drive-actions'
import { parseArgs } from './cli/cli-drive/cli-drive-args'
import { defaultApiEnv } from './defaults'
import { api } from './icloud/drive/api/api'
import { Use } from './icloud/drive/api/type'
import * as DF from './icloud/drive/drive'
import { apiLogger, cacheLogger, initLoggers, logger, printer, stderrLogger } from './lib/logging'
import { isKeyOf } from './lib/util'

const commands = {
  ls: Action.listUnixPath2,
  mkdir: Action.mkdir,
  rm: Action.rm,
  upload: Action.upload,
  mv: Action.move,
  autocomplete: Action.autocomplete,
  ac: Action.autocomplete,
  cat: Action.cat,
  recover: Action.recover,
  download: Action.download,
  edit: Action.edit,
  df: Action.downloadFolder,
}

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
  argv.glob
  if (!isKeyOf(commands, command)) {
    printer.error(`invalid command ${command}`)
    showHelp()
    sys.exit(1)
    return
  }

  const commandFunction = commands[command]

  await pipe(
    pipe(
      { ...argv, ...defaultApiEnv, ...api },
      cliActionM2(() => commandFunction(argv)),
    ),
    TE.fold(printer.errorTask, printer.printTask),
  )()
}

main()
