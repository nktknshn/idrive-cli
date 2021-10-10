import { Command } from 'commander'
import { identity, pipe } from 'fp-ts/lib/function'
import * as O from 'fp-ts/lib/Option'
import { not } from 'fp-ts/lib/Predicate'
import * as TE from 'fp-ts/lib/TaskEither'
import * as fs from 'fs/promises'
import { defaultSessionFile } from './config'
import { authorizeSession } from './icloud/authorization/authorize'
import { saveAccountData, validateSession } from './icloud/authorization/validate'
import { hasSessionToken, ICloudSessionState, ICloudSignInCredentials, session } from './icloud/session/session'
import { saveSession, tryReadSessionFile } from './icloud/session/session-file'
import { error } from './lib/errors'
import { fetchClient } from './lib/fetch-client'
import { input } from './lib/input'
import { logger } from './lib/logging'

export const fileExists = (file: string) => pipe(
    TE.tryCatch(
        () => fs.stat(file),
        e => 'error getting stats'
    ),
    TE.match(() => false, _ => true)
)

const init = (credentials: ICloudSignInCredentials, sessionFile = defaultSessionFile) => {
    return pipe(
        TE.fromTask<boolean, Error>(fileExists(sessionFile)),
        TE.chain(TE.fromPredicate(not(identity), () => error(`${sessionFile} exists.`))),
        TE.chain(() => TE.of(session(
            credentials.username,
            credentials.password
        ))),
        TE.chain(saveSession(sessionFile)),
        TE.mapLeft(_ => _.message)
    )
}

const cat = function (
    sessionFile = defaultSessionFile
) {
    return pipe(
        tryReadSessionFile(sessionFile),
    )
}

const validate = (sessionFile = defaultSessionFile) => {
    return pipe(
        tryReadSessionFile(sessionFile),
        TE.filterOrElseW(hasSessionToken, _ => `session missing token`),
        TE.chainW(session => validateSession({ session, client: fetchClient })),
        TE.matchW(
            error => { logger.error(`error validating session: ${error}`) },
            session => { O.isSome(session) ? logger.debug('valid') : logger.debug('invalid') })
    )
}

const authorize = (sessionFile = defaultSessionFile) => {
    return pipe(
        tryReadSessionFile(sessionFile),
        TE.chainW(session => {
            const auth = (session: ICloudSessionState) => authorizeSession({
                client: fetchClient,
                getCode: input({ prompt: 'code: ' }),
                session
            })

            if (hasSessionToken(session)) {
                return pipe(
                    validateSession({ session, client: fetchClient }),
                    TE.chainW(O.fold(() => auth(session), TE.of))
                )
            }

            return auth(session)
        }),
        TE.chainW(({ session, accountData: unsafeBody }) => pipe(
            saveSession(sessionFile)(session),
            TE.chainW(() => saveAccountData(unsafeBody, `${sessionFile}-accountData`))
        ))
    )
}

async function main() {
    const program = new Command();

    program
        .command('init [file]')
        .description('init session')
        .action(async (file?: string) => {
            logger.info(
                await init({
                    username: 'nikita@kanash.in',
                    password: 'Susanna667#'
                }, file)()
            )
        })

    program
        .command('cat [file]')
        .description('view session')
        .action(async (file?: string) => {
            logger.info(
                await cat(file)()
            )
        })

    program
        .command('validate [file]')
        .description('validate session')
        .action(async (file?: string) => {
            logger.info(
                await validate(file)()
            )
        })

    program
        .command('authorize [file]')
        .description('authorize session')
        .action(async (file: string) => {
            logger.info(
                await authorize(file)()
            );
        })

    await program.parseAsync()
}

main()