import { Command } from 'commander'
// import assert, { AssertionError } from 'assert'
import { pipe } from 'fp-ts/lib/function'
import * as TE from 'fp-ts/lib/TaskEither'
import * as O from 'fp-ts/lib/Option'

import path from 'path'
import { defaultSessionFile } from './config'
import { readAccountData } from './icloud/authorization/validate'
import { DriveItemFolderDetails, ItemFolder } from './icloud/drive/driveResponseType'
import { InvalidGlobalSessionResponse, retrieveItemDetailsInFolders } from './icloud/drive/retrieveItemDetailsInFolders'
import { saveJson, saveSession, tryReadSessionFile } from './icloud/session/session-file'
import { fetchClient } from './lib/fetch-client'
import { logger } from './lib/logging'
import { snd } from 'fp-ts/lib/ReadonlyTuple'
import { parsePath } from './icloud/drive/helpers'
import { ICloudSessionState } from './icloud/session/session'
import { error } from './lib/errors'
import { getUnixPath } from './icloud/drive/getUnixPath'
import * as Cache from './icloud/drive/cache';

const list = ({
    sessionFile = defaultSessionFile,
    drivewsids = ['FOLDER::com.apple.CloudDocs::root'],
} = {}) => {
    return pipe(
        TE.Do,
        TE.bind('session', () => tryReadSessionFile(sessionFile)),
        TE.bind('accountData', () => readAccountData(`${sessionFile}-accountData`)),
        TE.chainW(validatedSession => retrieveItemDetailsInFolders({
            validatedSession, client: fetchClient, drivewsids, 
            includeHierarchy: false, 
            partialData: true
        })),
        TE.mapLeft(e => InvalidGlobalSessionResponse.is(e) ? 'invalid session' : e),
        TE.map(_ => _.response.details[0])
    )
}


const listUnixPath = ({
    sessionFile = defaultSessionFile,
    path = '/',
} = {}): TE.TaskEither<Error, { session: ICloudSessionState, details: DriveItemFolderDetails }> => {

    return pipe(
        TE.Do,
        TE.apS('session', tryReadSessionFile(sessionFile)),
        TE.apS('accountData', readAccountData(`${sessionFile}-accountData`)),
        TE.chainW(validatedSession => getUnixPath(Cache.cache(), validatedSession, parsePath(path))),
        TE.chainFirstW(({ session }) => saveSession(sessionFile)(session)),
        TE.chainFirstW(({ cache }) => saveJson('cli-drive-cache.json')(cache)),

        // TE.mapLeft(e => InvalidGlobalSessionResponse.is(e) ? error('invalid session') : e),
    )
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

    await program.parseAsync()
}

main()