import { Command } from 'commander'
// import assert, { AssertionError } from 'assert'
import { constVoid, pipe } from 'fp-ts/lib/function'
import * as TE from 'fp-ts/lib/TaskEither'
import * as E from 'fp-ts/lib/Either'
import * as O from 'fp-ts/lib/Option'

import path from 'path'
import { defaultSessionFile } from './config'
import { readAccountData } from './icloud/authorization/validate'
import { DriveDetailsFolder, DriveChildrenItemFolder, DriveDetails } from './icloud/drive/types'
import { InvalidGlobalSessionResponse, retrieveItemDetailsInFolders } from './icloud/drive/retrieveItemDetailsInFolders'
import { saveJson, saveSession, tryReadSessionFile } from './icloud/session/session-file'
import { fetchClient } from './lib/fetch-client'
import { logger } from './lib/logging'
import { snd } from 'fp-ts/lib/ReadonlyTuple'
import { parsePath } from './icloud/drive/helpers'
import { ICloudSessionState } from './icloud/session/session'
import { error } from './lib/errors'
// import { getUnixPath } from './icloud/drive/getUnixPath'
import * as C from './icloud/drive/cache/cachef';

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
} = {}): TE.TaskEither<Error, DriveDetails> => {

    return pipe(
        TE.Do,
        TE.bind('session', () => tryReadSessionFile(sessionFile)),
        TE.bind('accountData', () => readAccountData(`${sessionFile}-accountData`)),
        TE.bind('api', validatedSession => TE.of(new C.DriveApi(validatedSession))),
        TE.bindW('drive', ({ api }) => pipe(
            C.Cache.tryReadFromFile('data/cli-drive-cache.json'),
            TE.map(C.Cache.create),
            TE.orElseW(e => TE.of(C.Cache.create())),
            TE.chain(cache => TE.of(new C.Drive(api, cache)))
        )),
        // TE.of(new Cache.Drive(api)))
        TE.bind('result', ({ drive, api }) => TE.bracket(
            TE.of({ drive, api }),
            () => drive.getFolder(path),
            ({ drive, api }, e) => pipe(
                saveSession(sessionFile)(api.getSession().session),
                TE.chain(() =>
                    E.isLeft(e) && C.InconsistentCache.is(e.left)
                        ? TE.of(constVoid())
                        : C.Cache.trySaveFile(drive.cacheGet(), 'data/cli-drive-cache.json')
                )
            )
        )),
        // TE.chainFirstW(({ api }) => saveSession(sessionFile)(api.getSession().session)),
        TE.map(_ => _.result)
        // TE.chainFirstW(({ cache }) => saveJson('cli-drive-cache.json')(cache)),
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