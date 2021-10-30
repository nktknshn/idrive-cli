import { boolean } from 'fp-ts'
import { flow, pipe } from 'fp-ts/lib/function'
import * as J from 'fp-ts/lib/Json'
import * as TE from 'fp-ts/lib/TaskEither'
import { hideBin } from 'yargs/helpers'
import yargs from 'yargs/yargs'
import { cliAction } from './cli/cli-action'
import { Env } from './cli/types'
import { defaultCacheFile, defaultSessionFile } from './config'
import { consumeStream } from './icloud/drive/requests/download'
import { cacheLogger, logger, loggingLevels, printer } from './lib/logging'

import { listUnixPath } from './cli/actions/ls'
import { checkForUpdates, update } from './cli/actions/update'
import { ensureError } from './lib/errors'

function parseArgs() {
  return yargs(hideBin(process.argv))
    // .parserConfiguration({})
    .options({
      sessionFile: { alias: ['s', 'session'], default: defaultSessionFile },
      cacheFile: { alias: ['c', 'cache'], default: defaultCacheFile },
      noCache: { alias: 'n', default: false, type: 'boolean' },
      raw: { alias: 'r', default: false, type: 'boolean' },
      debug: { alias: 'd', default: false, type: 'boolean' },
      update: { alias: 'u', default: false, type: 'boolean' },
    })
    .command('ls [path]', 'list files in a folder', _ =>
      _
        .positional('path', { type: 'string', default: '/' })
        .options({
          fullPath: { alias: ['f'], default: false, type: 'boolean' },
          listInfo: { alias: ['l'], default: false, type: 'boolean' },
          recursive: { alias: ['R'], default: false, type: 'boolean' },
          depth: { alias: ['D'], default: 0, type: 'number', demandOption: 'recursive' },
        }))
    .command('update [path]', 'update cache', _ =>
      _
        .positional('path', { type: 'string', default: '/' })
        .options({
          fullPath: { alias: ['f'], default: false, type: 'boolean' },
          recursive: { alias: ['R'], default: false, type: 'boolean' },
          depth: { alias: ['D'], default: 0, type: 'number', demandOption: 'recursive' },
        }))
    .command('mkdir <path>', 'mkdir', (_) => _.positional('path', { type: 'string', demandOption: true }))
    .command('check', 'check updates', (_) => _.positional('path', { type: 'string', default: '/' }))
    .command('cat <path>', 'cat', (_) => _.positional('path', { type: 'string', demandOption: true }))
    .help()
}

async function main() {
  const { argv, showHelp } = parseArgs()

  logger.add(
    argv.debug
      ? loggingLevels.debug
      : loggingLevels.info,
  )

  cacheLogger.add(
    argv.debug
      ? loggingLevels.debug
      : loggingLevels.info,
  )

  // logger.debug(argv)

  const [command] = argv._

  switch (command) {
    case 'ls':
      await pipe(
        listUnixPath(argv),
        TE.fold(printer.errorTask, printer.printTask),
      )()
      break
    case 'mkdir':
      logger.info(await mkdir(argv)())
      break
    case 'cat':
      await pipe(
        cat(argv),
        TE.fold(printer.errorTask, printer.printTask),
      )()
      break
    case 'rm':
      logger.info(await rm(argv)())
      break
    case 'update':
      await pipe(
        update(argv),
        TE.fold(printer.errorTask, printer.printTask),
      )()
      break
    case 'check':
      await pipe(
        checkForUpdates(argv),
        TE.chain(flow(J.stringify, TE.fromEither)),
        TE.mapLeft(ensureError),
        TE.fold(printer.errorTask, printer.printTask),
      )()
      break
    default:
      command && printer.error(`invalid command ${command}`)
      showHelp()
      break
  }
}

const mkdir = (
  { sessionFile, cacheFile, path, raw, noCache }: Env & { path: string },
): TE.TaskEither<Error, unknown> => {
  return cliAction(
    { sessionFile, cacheFile, noCache },
    ({ drive }) => drive.createFolder(path),
  )
}

const cat = (
  { sessionFile, cacheFile, path, raw, noCache }: Env & { path: string },
): TE.TaskEither<Error, unknown> => {
  return cliAction(
    { sessionFile, cacheFile, noCache },
    ({ drive }) =>
      pipe(
        drive.getDownloadStream(path),
        TE.chain(consumeStream),
        // TE.map(_ => new TextDecoder().decode(_))
      ),
  )
}

const rm = (
  { sessionFile, cacheFile, path, raw, noCache }: Env & { path: string },
): TE.TaskEither<Error, unknown> => {
  return cliAction(
    { sessionFile, cacheFile, noCache },
    ({ drive }) => drive.removeItemByPath(path),
  )
}

/* const upload = (
  sourcePath: string,
  targetPath: string,
  { sessionFile = defaultSessionFile, cacheFile = defaultCacheFile } = {},
): TE.TaskEither<Error, unknown> => {
  return cliAction(
    { sessionFile, cacheFile, noCache },
    ({ drive }) => drive.upload(sourcePath, targetPath),
  )
} */

/*
  program
    .command('upload <sourcePath> <targetPath>')
    .description('rm')
    .action(async (sourcePath: string, targetPath: string) => {
      assert(sourcePath)
      assert(targetPath)

      logger.info(await upload(sourcePath, targetPath)())
    })

  await program.parseAsync()
} */
// const byAge: Ord<User> = contramap((user: User) => user.age)(ordNumber)

main()
