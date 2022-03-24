import { pipe } from 'fp-ts/lib/function'
import * as R from 'fp-ts/lib/Reader'
import * as SRTE from 'fp-ts/lib/StateReaderTaskEither'
import * as TE from 'fp-ts/lib/TaskEither'
import { sys } from 'typescript'
import { cliAction } from './cli/cli-action'
import * as Action from './cli/cli-drive/cli-drive-actions'
import { parseArgs } from './cli/cli-drive/cli-drive-args'
import { defaultApiEnv } from './defaults'
import { DepApi } from './icloud/drive'
import { apiCreator, defaultWrapper } from './icloud/drive/deps/api-creator'
import * as fs from './lib/fs'
import { apiLogger, cacheLogger, initLoggers, logger, printer, stderrLogger } from './lib/logging'
import { XXXX } from './lib/types'
import { isKeyOf } from './lib/util'

const commands = {
  ls: Action.listUnixPath2,
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
  // init: Action.initSession,
  uf: Action.uploadFolder,
}

type LLLL = typeof commands extends { [key: string]: infer V } ? V : never
type CommandsDeps = LLLL extends (...args: infer Args) => SRTE.StateReaderTaskEither<infer S, infer R, infer E, infer A>
  ? R
  : never

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

  const d = pipe(
    R.Do,
    R.bind('fetchClient', () => R.of(defaultApiEnv.fetchClient)),
    R.bind('api', () => apiCreator),
    R.bind('fs', () => R.of(fs)),
  )

  if (command === 'init') {
    return await pipe(
      { ...argv, ...d(defaultApiEnv) },
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

  type GlobalDeps = CommandsDeps & DepApi<'authorizeSession'>

  const deps: GlobalDeps = d({
    fetchClient: defaultApiEnv.fetchClient,
    // fetch: failingFetch(70),
    getCode: defaultApiEnv.getCode,
    retries: defaultApiEnv.retries,
    retryDelay: 200,
    catchSessErrors: true,
    catchFetchErrors: true,
  })

  await pipe(
    pipe(
      { ...argv, ...deps },
      cliAction<unknown, CommandsDeps>(() => commandFunction(argv)),
    ),
    TE.fold(printer.errorTask, printer.printTask),
  )()
}

main()
