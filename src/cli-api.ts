import { hole, pipe } from 'fp-ts/lib/function'
import * as TE from 'fp-ts/lib/TaskEither'
import { apiAction } from './cli/cli-actionF'
import { hierarchy } from './icloud/drive/types-io'

// const actionsNames = ['retrieveHierarchy', 'retrieveItemDetails', 'retrieveItemDetailsInFolders'] as const

// type Action = (typeof actionsNames)[number]

// const validateAction = (action: string): action is Action => (actionsNames as readonly string[]).includes(action)

console.log(
  hierarchy.decode([{ drivewsid: 'FOLDER::com.apple.CloudDocs::root' }]),
)

// function parseArgs() {
//   return yargs(hideBin(process.argv))
//     // .parserConfiguration({})
//     .options({
//       sessionFile: { alias: ['s', 'session'], default: defaultSessionFile },
//       // cacheFile: { alias: ['c', 'cache'], default: defaultCacheFile },
//       // noCache: { alias: 'n', default: false, type: 'boolean' },
//       raw: { alias: 'r', default: false, type: 'boolean' },
//       debug: { alias: 'd', default: false, type: 'boolean' },
//     })
//     .command('retrieveHierarchy [drivewsids..]', 'get h for drivewsids', _ =>
//       _
//         .positional('drivewsids', { type: 'string', array: true, demandOption: true })
//         .options({}))
//     .command('retrieveItemDetails [drivewsids..]', 'get h for drivewsids', _ =>
//       _
//         .positional('drivewsids', { type: 'string', array: true, demandOption: true })
//         .options({}))
//     .command('retrieveItemDetailsInFolders [drivewsids..]', 'get h for drivewsids', _ =>
//       _
//         .positional('drivewsids', { type: 'string', array: true, demandOption: true })
//         .options({
//           h: { type: 'boolean', default: false },
//         }))
//     .help()
// }
// retrieveHierarchy(
//   fetchClient,
//   { session, accountData },
//   { drivewsids: argv.drivewsids },
// )
const actions = {
  retrieveHierarchy: (argv: {
    sessionFile: string
    raw: boolean
    debug: boolean
    drivewsids: string[]
  }) =>
    apiAction(
      { sessionFile: argv.sessionFile },
      ({ api, session, accountData }) =>
        pipe(
          TE.Do,
          // TE.bind(
          //   'hierarchy',
          //   () => hole(),
          // ),
          // TE.bind('path', ({ hierarchy }) => TE.of(hierarchyToPath(hierarchy.response.body[0].hierarchy))),
        ),
    ),
  // retrieveItemDetails: (argv: {
  //   sessionFile: string
  //   raw: boolean
  //   debug: boolean
  //   drivewsids: string[]
  // }) =>
  //   apiAction(
  //     { sessionFile: argv.sessionFile },
  //     ({ api }) =>
  //       pipe(
  //         TE.Do,
  //         TE.bind('details', () => api.retrieveItemsDetails(argv.drivewsids)),
  //         // TE.bind('path', ({ hierarchy }) => TE.of(hierarchyToPath(hierarchy[0].hierarchy))),
  //       ),
  //   ),
  // retrieveItemDetailsInFolders: (argv: {
  //   sessionFile: string
  //   raw: boolean
  //   debug: boolean
  //   drivewsids: string[]
  //   h: boolean
  // }) =>
  //   apiAction(
  //     { sessionFile: argv.sessionFile },
  //     ({ api }) =>
  //       pipe(
  //         TE.Do,
  //         TE.bind(
  //           'details',
  //           () =>
  //             (argv.h
  //               ? api.retrieveItemDetailsInFoldersHierarchies
  //               : api.retrieveItemDetailsInFolders)(argv.drivewsids),
  //         ),
  //         // TE.bind('path', ({ hierarchy }) => TE.of(hierarchyToPath(hierarchy[0].hierarchy))),
  //       ),
  //   ),
} as const

async function main() {
  // const { argv, showHelp } = parseArgs()

  // logger.add(
  //   argv.debug
  //     ? loggingLevels.debug
  //     : loggingLevels.info,
  // )

  // logger.debug(argv)

  // cacheLogger.add(
  //   loggingLevels.info,
  // )

  // const [command] = argv._

  // assert(typeof command === 'string' && validateAction(command))

  // const te: TE.TaskEither<Error, unknown> = actions[command](argv)

  // await pipe(
  //   te,
  //   TE.chain(flow(J.stringify, TE.fromEither)),
  //   TE.mapLeft(ensureError),
  //   TE.fold(printer.errorTask, printer.printTask),
  // )()
  // logger.debug(argv)

  // const [command] = argv._
}

main()
