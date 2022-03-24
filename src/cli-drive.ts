import { pipe } from 'fp-ts/lib/function'
import * as SRTE from 'fp-ts/lib/StateReaderTaskEither'
import * as TE from 'fp-ts/lib/TaskEither'
import { sys } from 'typescript'
import { driveAction } from './cli/cli-action'
import * as Action from './cli/cli-drive/cli-drive-actions'
import { parseArgs } from './cli/cli-drive/cli-drive-args'
import { cliActionsDependancies } from './cli/cli-drive/cli-drive-deps'
import { defaultApiEnv } from './defaults'
import { apiLogger, cacheLogger, initLoggers, logger, printer, stderrLogger } from './lib/logging'
import { isKeyOf } from './lib/util'

const commands = {
  ls: Action.listUnixPath,
  mkdir: Action.mkdir,
  rm: Action.rm,
  upload: Action.upload,
  uploads: Action.uploads,
  mv: Action.move,
  autocomplete: Action.autocomplete,
  ac: Action.autocomplete,
  cat: Action.cat,
  recover: Action.recover,
  download: Action.download,
  edit: Action.edit,
  df: Action.downloadFolder,
  uf: Action.uploadFolder,
}

type LLLL = typeof commands extends { [key: string]: infer V } ? V : never

type CommandsDeps = LLLL extends (...args: infer Args) => SRTE.StateReaderTaskEither<infer S, infer R, infer E, infer A>
  ? R
  : never

type GlobalDeps = CommandsDeps

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

  const deps = cliActionsDependancies(defaultApiEnv)

  if (command === 'init') {
    return await pipe(
      { ...argv, ...deps },
      Action.initSession(),
      TE.fold(printer.errorTask, printer.printTask),
    )()
  }

  if (!isKeyOf(commands, command)) {
    printer.error(`invalid command ${command}`)
    showHelp()
    sys.exit(1)
    return
  }

  // const d = { ...defaultApiEnv, fetch: failingFetch(90) }

  const commandFunction = commands[command]

  await pipe(
    pipe(
      { ...argv, ...deps },
      driveAction<unknown, CommandsDeps>(() => commandFunction(argv)),
    ),
    TE.fold(printer.errorTask, printer.printTask),
  )()
}

main()
