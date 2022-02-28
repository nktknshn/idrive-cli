import { pipe } from 'fp-ts/lib/function'
import * as SRTE from 'fp-ts/lib/StateReaderTaskEither'
import * as TE from 'fp-ts/lib/TaskEither'
import { sys } from 'typescript'
import { cliActionM2 } from './cli/cli-action'
import * as Action from './cli/cli-drive/cli-drive-actions'
import { parseArgs } from './cli/cli-drive/cli-drive-args'
import { defaultApiEnv } from './defaults'
import * as DF from './icloud/drive/drive'
import { apiLogger, cacheLogger, initLoggers, logger, printer, stderrLogger } from './lib/logging'
import { isKeyOf } from './lib/util'

const commands = {
  ls: Action.listUnixPath,
  mkdir: Action.mkdir,
  rm: Action.rm,
  upload: Action.upload,
  uploads: ({ sessionFile, cacheFile, srcpaths, dstpath, noCache }: {
    srcpaths: string[]
    dstpath: string
    noCache: boolean
    sessionFile: string
    cacheFile: string
  }) =>
    pipe(
      { sessionFile, cacheFile, noCache, ...defaultApiEnv },
      cliActionM2(() =>
        pipe(
          DF.readEnvS(() => DF.of(`srcpaths=${srcpaths} dstpath=${dstpath}`)),
        )
      ),
    ),
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
    [logger, cacheLogger, stderrLogger, apiLogger],
  )

  if (!isKeyOf(commands, command)) {
    printer.error(`invalid command ${command}`)
    showHelp()
    sys.exit(1)
    return
  }

  const commandFunction = commands[command]

  await pipe(
    commandFunction(argv),
    TE.fold(
      printer.errorTask,
      printer.printTask,
    ),
  )()
}

main()
