import * as A from 'fp-ts/lib/Array'
import { pipe } from 'fp-ts/lib/function'
import * as TE from 'fp-ts/lib/TaskEither'
import { sys } from 'typescript'
import yargs, { Options } from 'yargs'
import { hideBin } from 'yargs/helpers'
import * as AS from './cli/cli-drive/cli-drive-actions'
import { normalizePath } from './cli/cli-drive/cli-drive-actions/helpers'
import { defaultCacheFile, defaultSessionFile } from './config'
import { retrieveTrashDetails } from './icloud/drive/api'
import * as AR from './icloud/drive/requests/request'
// import { map } from './icloud/drive/ffdrive'
import * as DF from './icloud/drive/ffdrive'
import { cliActionM2 } from './icloud/drive/ffdrive/cli-action'
// import { retrieveTrashDetailsM } from './icloud/drive/requests'
import { apiActionM } from './cli/api-action'
import { retrieveTrashDetailsM } from './icloud/drive/requests'
import { DetailsTrash, fileName } from './icloud/drive/requests/types/types'
import { apiLogger, cacheLogger, initLoggers, logger, printer, stderrLogger } from './lib/logging'
import { isKeyOf } from './lib/util'

export function parseArgs() {
  return yargs(hideBin(process.argv))
    .options({
      sessionFile: { alias: ['s', 'session'], default: defaultSessionFile },
      cacheFile: { alias: ['c', 'cache'], default: defaultCacheFile },
      noCache: { alias: 'n', default: false, type: 'boolean' },
      raw: { alias: 'r', default: false, type: 'boolean' },
      debug: { alias: 'd', default: true, type: 'boolean' },
    })
    .command(
      'ls [paths..]',
      'list files in trash',
      _ =>
        _.positional('paths', { type: 'string', array: true, default: ['/'] })
          .options({}),
    )
    .command(
      'recover [path]',
      'recover those files',
      (_) =>
        _.positional('path', { type: 'string', demandOption: true })
          .options({}),
    )
    .help()
}

const showTrash = (trash: DetailsTrash) => {
  const items = trash.items

  let result = ''

  for (const item of items) {
    result += fileName(item)
  }
}

const ls = (
  argv: { sessionFile: string; cacheFile: string; noCache: boolean; paths: string[] },
) => {
  const npaths = pipe(argv.paths, A.map(normalizePath))

  logger.debug(`paths: ${npaths}`)
  return pipe(
    apiActionM(
      () => {
        return pipe(
          retrieveTrashDetailsM(),
          AR.map(_ => _.items.map(fileName).join('\n')),
        )
      },
    )(argv),
  )
}

const recover = (
  argv: { sessionFile: string; cacheFile: string; noCache: boolean; path: string },
) => {
  return apiActionM(
    () => {
      return pipe(
        retrieveTrashDetailsM(),
        AR.map(_ => _.items.map(fileName).join('\n')),
      )
    },
  )(argv)
}

const commands = { ls, recover }

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

  const commandFunction = commands[command]

  await pipe(
    commandFunction(argv),
    TE.fold(printer.errorTask, printer.printTask),
  )()
}

main()
