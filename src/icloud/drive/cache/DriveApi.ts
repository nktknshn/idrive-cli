import * as A from 'fp-ts/lib/Array';
import { logger } from "../../../lib/logging";
import { pipe } from "fp-ts/lib/function";
import { authorizeSession, ICloudSessionValidated } from "../../authorization/authorize";
import { fetchClient, FetchClientEither } from "../../../lib/fetch-client";
import * as TE from 'fp-ts/lib/TaskEither';
import { input } from "../../../lib/input";
import { error } from "../../../lib/errors";
import { download } from "../requests/download";
import { InvalidGlobalSessionResponse, retrieveItemDetailsInFolders } from '../requests/retrieveItemDetailsInFolders';
import { createFolders } from '../requests/createFolders';
import { moveItemsToTrash } from '../requests/moveItemsToTrash';


export class DriveApi {
    constructor(
        private session: ICloudSessionValidated,
        public client: FetchClientEither = fetchClient
    ) { }

    private onInvalidSession = (): TE.TaskEither<Error, void> => {
        return pipe(
            authorizeSession({
                client: this.client,
                getCode: input({ prompt: 'code: ' }),
                session: this.session.session
            }),
            TE.chainW(this.setSession)
        );
    };

    private query = <E extends Error, A>(te: () => TE.TaskEither<E, A>): TE.TaskEither<Error, A> => {
        return pipe(
            te(),
            TE.orElseW(e => {
                return InvalidGlobalSessionResponse.is(e)
                    ? pipe(
                        this.onInvalidSession(),
                        TE.chainW(() => this.query(te))
                    )
                    : TE.left(e);
            })
        );
    };

    private setSession = (
        session: ICloudSessionValidated
    ): TE.TaskEither<never, void> => {
        return TE.fromTask<void, never>(
            async () => { this.session = session; }
        );
    }

    public getSession = () => this.session;

    public retrieveItemDetailsInFolders = (drivewsids: string[]) => {

        logger.info(`retrieveItemDetailsInFolders(${drivewsids})`);

        return pipe(
            this.query(() => retrieveItemDetailsInFolders({
                client: this.client,
                partialData: false,
                includeHierarchy: false,
                validatedSession: this.session,
                drivewsids
            })),
            TE.chainFirstW(({ session }) => this.setSession({
                accountData: this.session.accountData,
                session
            })),
            TE.map(_ => _.response.details)
        );
    };

    public retrieveItemDetailsInFolder = (drivewsid: string) => {
        return pipe(
            this.retrieveItemDetailsInFolders([drivewsid]),
            TE.map(A.lookup(0)),
            TE.chain(TE.fromOption(() => error(`folder ${drivewsid} was not found`)))
        );
    };

    public download = (documentId: string, zone: string): TE.TaskEither<Error, string> => {
        return pipe(
            this.query(
                () => download({
                    client: this.client,
                    validatedSession: this.session,
                    documentId,
                    zone
                })),
            TE.chainFirstW(({ session }) => this.setSession({
                accountData: this.session.accountData,
                session
            })),
            TE.map(_ => _.response.body.data_token.url)
        );
    };

    public createFolders = (
        parentId: string,
        folderNames: string[]
    ) => {
        return pipe(
            this.query(
                () => createFolders({
                    client: this.client,
                    validatedSession: this.session,
                    destinationDrivewsId: parentId,
                    names: folderNames
                })),
            TE.chainFirstW(({ session }) => this.setSession({
                accountData: this.session.accountData,
                session
            })),
            TE.map(_ => _.response.response)
        );
    }

    public moveItemsToTrash = (drivewsids: string[]) => {
        return pipe(
            this.query(
                () => moveItemsToTrash({
                    client: this.client,
                    validatedSession: this.session,
                    drivewsids
                })),
            TE.chainFirstW(({ session }) => this.setSession({
                accountData: this.session.accountData,
                session
            })),
            TE.map(_ => _.response.response)
        );
    }
}
