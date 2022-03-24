import * as E from 'fp-ts/lib/Either'
import { pipe } from 'fp-ts/lib/function'
import * as TE from 'fp-ts/lib/TaskEither'
import { hideBin } from 'yargs/helpers'
import yargs from 'yargs/yargs'
import { defaultCacheFile } from './config'
import * as C from './icloud/drive/cache/cache'
import * as GetByPathResultValid from './icloud/drive/cache/cache-get-by-path-types'
import { cacheLogger, logger, loggingLevels, printer } from './lib/logging'
import { normalizePath } from './lib/normalize-path'

function parseArgs() {
  return yargs(hideBin(process.argv))
    // .parserConfiguration({})
    .options({
      cacheFile: { alias: ['c', 'cache'], default: defaultCacheFile },
      raw: { alias: 'r', default: false, type: 'boolean' },
      debug: { alias: 'd', default: false, type: 'boolean' },
    })
    .command('ls [path]', 'list files in a folder', _ =>
      _
        .positional('path', { type: 'string', default: '/' })
        .options({
          fullPath: { alias: ['f'], default: false, type: 'boolean' },
          recursive: { alias: ['R'], default: false, type: 'boolean' },
          depth: { alias: ['D'], default: 0, type: 'number', demandOption: 'recursive' },
        }) // .options({ short: { alias: ['h'], default: false, type: 'boolean' } })
    )
    .help()
}

const isDrivewsid = (path: string) => /^([A-Z]+?)::([a-zA-Z0-9\\.]+?)::([A-Z0-9\\-]+?)$/.test(path)

// async function main() {
//   const { argv, showHelp } = parseArgs()

//   logger.add(
//     argv.debug
//       ? loggingLevels.debug
//       : loggingLevels.info,
//   )

//   cacheLogger.add(
//     loggingLevels.info,
//   )

//   // logger.debug(argv)

//   const [command] = argv._

//   switch (command) {
//     case 'ls':
//       await pipe(
//         TE.Do,
//         TE.bind('cache', () =>
//           pipe(
//             C.tryReadFromFile(argv.cacheFile),
//             TE.map(C.cachef),
//           )),
//         TE.bind('root', ({ cache }) => TE.fromEither(C.getDocwsRoot(cache))),
//         TE.map(({ cache, root }) =>
//           pipe(
//             isDrivewsid(argv.path)
//               ? C.getByIdWithPath(argv.path)
//               : pipe(
//                 C.getByPath(root.content, normalizePath(argv.path))(cache),
//                 // E.fold((e) => `Error: ${e.message}`, GetByPathResultValid.showGetByPathResult),
//                 // logReturnAs('result'),
//               ),
//           )
//         ),
//         // TE.chain(flow(J.stringify, TE.fromEither)),
//         // TE.mapLeft(ensureError),
//         TE.fold(printer.errorTask, printer.printTask),
//       )()
//       break
//     default:
//       command && printer.error(`invalid command ${command}`)
//       showHelp()
//       break
//   }
// }

// main()
