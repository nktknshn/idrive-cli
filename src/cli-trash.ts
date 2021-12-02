import { pipe } from 'fp-ts/lib/function'
import * as TE from 'fp-ts/lib/TaskEither'
import { sys } from 'typescript'
import yargs from 'yargs'
import { hideBin } from 'yargs/helpers'
import { cliAction } from './cli/cli-action'
import * as AS from './cli/cli-drive-actions'
import { defaultCacheFile, defaultSessionFile } from './config'
import { fileName } from './icloud/drive/helpers'
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
        _.positional('paths', { type: 'string', array: true, demandOption: true })
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

const ls = (
  argv: { sessionFile: string; cacheFile: string; noCache: boolean },
) => {
  return cliAction(
    argv,
    ({ cache, api }) => {
      return pipe(
        api.retrieveTrashDetails(),
        TE.map(_ => _.items.map(fileName).join('\n')),
      )
    },
  )
}

const recover = (
  argv: { sessionFile: string; cacheFile: string; noCache: boolean; path: string },
) => {
  return cliAction(
    argv,
    ({ cache, api }) => {
      return pipe(
        api.retrieveTrashDetails(),
        TE.map(_ => _.items.map(fileName).join('\n')),
      )
    },
  )
}

const commands = {
  ls,
  recover,
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

  const commandFunction = commands[command]

  await pipe(
    commandFunction(argv),
    TE.fold(printer.errorTask, printer.printTask),
  )()
}

main()
