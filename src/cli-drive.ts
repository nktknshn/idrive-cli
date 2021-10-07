import assert from 'assert'
import { Command } from 'commander'
import * as TE from 'fp-ts/lib/TaskEither'
import { cliAction } from './cli/cliAction'
import { defaultCacheFile, defaultSessionFile } from './config'
import { DriveDetails } from './icloud/drive/types'
import { logger } from './lib/logging'


// const list = ({
//     sessionFile = defaultSessionFile,
//     drivewsids = ['FOLDER::com.apple.CloudDocs::root'],
// } = {}) => {
//     return pipe(
//         TE.Do,
//         TE.bind('session', () => tryReadSessionFile(sessionFile)),
//         TE.bind('accountData', () => readAccountData(`${sessionFile}-accountData`)),
//         TE.chainW(validatedSession => retrieveItemDetailsInFolders({
//             validatedSession, client: fetchClient, drivewsids,
//             includeHierarchy: false,
//             partialData: true
//         })),
//         TE.mapLeft(e => InvalidGlobalSessionResponse.is(e) ? 'invalid session' : e),
//         TE.map(_ => _.response.details[0])
//     )
// }


const listUnixPath = ({
    sessionFile = defaultSessionFile,
    cacheFile = defaultCacheFile,
    path = '/',
} = {}): TE.TaskEither<Error, DriveDetails> => {

    return cliAction(({ drive }) => drive.getFolder(path), { sessionFile, cacheFile })
}

const mkdir = (
    path: string,
    {
        sessionFile = defaultSessionFile,
        cacheFile = defaultCacheFile,
    } = {}): TE.TaskEither<Error, unknown> => {

    return cliAction(({ drive }) => drive.createFolder(path), { sessionFile, cacheFile })
}

async function main() {

    logger.debug('Drive')

    const program = new Command();

    program
        .command('ls [path]')
        .description('list')
        .action(async (path?: string) => {
            logger.info(
                await listUnixPath({
                    path
                })()
            )
        })

    program
        .command('mkdir [path]')
        .description('mkdir')
        .action(async (path?: string) => {
            assert(path)
            logger.info(
                await mkdir(path)()
            )
        })

    await program.parseAsync()
}

main()