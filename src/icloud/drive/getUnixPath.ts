import { pipe } from 'fp-ts/lib/function';
import * as TE from 'fp-ts/lib/TaskEither';
import * as A from 'fp-ts/lib/Array';
import { DriveItemFolderDetails } from './driveResponseType';
import { retrieveItemDetailsInFolders } from './retrieveItemDetailsInFolders';
import { fetchClient } from '../../lib/fetch-client';
import { logger } from '../../lib/logging';
import { ICloudSessionValidated } from '../authorization/authorize';
import { ICloudSessionState } from '../session/session';
import { NotFoundError, ItemIsNotFolder } from "./errors";
import { ICloudDriveCache } from './cache';
import * as Cache from '../drive/cache';

export const getUnixPath = (
    cache: ICloudDriveCache,
    validatedSession: ICloudSessionValidated,
    [child, ...rest]: string[],
    parent = {
        drivewsid: "FOLDER::com.apple.CloudDocs::root",
        name: ""
    }
): TE.TaskEither<Error, { session: ICloudSessionState; details: DriveItemFolderDetails; cache: ICloudDriveCache }> => {
    logger.debug({ parent, child, rest });
    return pipe(
        retrieveItemDetailsInFolders({
            validatedSession,
            client: fetchClient,
            drivewsids: [parent.drivewsid],
            includeHierarchy: true,
            partialData: false
        }),
        TE.bind('item', _ => TE.of(_.response.details[0])),
        TE.chainW(({ session, item }) => {
            if (child) {
                return pipe(
                    item.items,
                    A.findFirst(_ => _.name == child),
                    TE.fromOption(() => NotFoundError.create(`${child} was not found in ${parent.name}`)),
                    TE.filterOrElseW(
                        _ => _.type === 'FOLDER',
                        _ => ItemIsNotFolder.create(`${_.name} is ${_.type} not FOLDER`)),
                    TE.chainW(
                        childitem => getUnixPath(
                            Cache.put(cache, item), 
                            {
                            session,
                            accountData: validatedSession.accountData
                        }, rest, childitem)
                    ));
            }

            return TE.of({ session, details: item, cache: Cache.put(cache, item) });
        })
    );
};
