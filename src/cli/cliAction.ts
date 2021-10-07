import { constVoid, pipe } from 'fp-ts/lib/function';
import * as TE from 'fp-ts/lib/TaskEither';
import * as E from 'fp-ts/lib/Either';
import { defaultCacheFile, defaultSessionFile } from '../config';
import { readAccountData } from '../icloud/authorization/validate';
import { saveSession, tryReadSessionFile } from '../icloud/session/session-file';
import * as C from '../icloud/drive/cache/cachef';
import * as InconsistentCache from "../icloud/drive/cache/types";
import * as Drive from "../icloud/drive/cache/Drive";
import * as DriveApi from "../icloud/drive/cache/DriveApi";

export const cliAction = <T>(
    f: (deps: {
        drive: Drive.Drive;
    }) => TE.TaskEither<Error, T>,
    {
        sessionFile = defaultSessionFile, cacheFile = defaultCacheFile
    } = {}) => {
    return pipe(
        TE.Do,
        TE.bind('session', () => tryReadSessionFile(sessionFile)),
        TE.bind('accountData', () => readAccountData(`${sessionFile}-accountData`)),
        TE.bind('api', validatedSession => TE.of(new DriveApi.DriveApi(validatedSession))),
        TE.bindW('drive', ({ api }) => pipe(
            C.Cache.tryReadFromFile(cacheFile),
            TE.map(C.Cache.create),
            TE.orElseW(e => TE.of(C.Cache.create())),
            TE.chain(cache => TE.of(new Drive.Drive(api, cache)))
        )),
        TE.bind('result', ({ drive, api }) => TE.bracket(
            TE.of({ drive, api }),
            () => f({ drive }),
            ({ drive, api }, e) => pipe(
                saveSession(sessionFile)(api.getSession().session),
                TE.chain(() => E.isLeft(e) && InconsistentCache.InconsistentCache.is(e.left)
                    ? TE.of(constVoid())
                    : C.Cache.trySaveFile(drive.cacheGet(), cacheFile)
                )
            )
        )),
        TE.map(_ => _.result)
    );
};
