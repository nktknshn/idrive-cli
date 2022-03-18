import { pipe } from 'fp-ts/lib/function'
import * as R from 'fp-ts/lib/Reader'
import * as SRTE from 'fp-ts/lib/StateReaderTaskEither'
import * as TE from 'fp-ts/lib/TaskEither'
import { sys } from 'typescript'
import { cliActionM2 } from './cli/cli-action'
import * as Action from './cli/cli-drive/cli-drive-actions'
import { parseArgs } from './cli/cli-drive/cli-drive-args'
import { defaultApiEnv } from './defaults'
import { createApiDeps } from './icloud/drive/api/deps'
import { failingFetch } from './lib/http/fetch-client'
import { apiLogger, cacheLogger, initLoggers, logger, printer, stderrLogger } from './lib/logging'
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
  init: Action.initSession,
  uf: Action.uploadFolder,
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

  if (!isKeyOf(commands, command)) {
    printer.error(`invalid command ${command}`)
    showHelp()
    sys.exit(1)
    return
  }

  if (command === 'init') {
    return await pipe(
      { ...argv, ...defaultApiEnv, ...createApiDeps(defaultApiEnv) },
      Action.initSession(),
      TE.fold(printer.errorTask, printer.printTask),
    )()
  }

  // const d = { ...defaultApiEnv, fetch: failingFetch(90) }

  const commandFunction = commands[command]

  const deps = createApiDeps({
    fetch: defaultApiEnv.fetch,
    // fetch: failingFetch(70),
    getCode: defaultApiEnv.getCode,
    retries: defaultApiEnv.retries,
    retryDelay: 200,
    catchSessErrors: true,
    catchFetchErrors: true,
    // catchFetchErrorsSRTE: catchFetchErrorsSRTE2,
    // schemaMapper: (schema) => ({
    //   ...schema,
    //   authorizeSession: pipe(
    //     schema.authorizeSession,
    //     R.local((d) => ({ ...d, fetch: failingFetch(99) })),
    //   ),
    //   retrieveItemDetailsInFolders: pipe(
    //     schema.retrieveItemDetailsInFolders,
    //     R.local((d) => ({ ...d, fetch: failingFetch(99), catchFetchErrors: true })),
    //   ),
    // }),
  })

  await pipe(
    pipe(
      { ...argv, ...deps },
      cliActionM2(() => commandFunction(argv)),
    ),
    TE.fold(printer.errorTask, printer.printTask),
  )()
}

main()
