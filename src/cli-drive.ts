import { pipe } from 'fp-ts/lib/function'
import * as TE from 'fp-ts/lib/TaskEither'
import { sys } from 'typescript'
import { cliAction } from './cli/cli-action'
import * as Action from './cli/cli-drive/cli-drive-actions'
import { parseArgs } from './cli/cli-drive/cli-drive-args'
import { defaultApiEnv } from './defaults'
import { createApiDeps } from './icloud/drive/api/deps'
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

  const apideps = createApiDeps({
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
      { ...argv, ...apideps },
      cliAction(() => commandFunction(argv)),
    ),
    TE.fold(printer.errorTask, printer.printTask),
  )()
}

main()
