import * as A from 'fp-ts/lib/Array';
import * as O from 'fp-ts/lib/Option';
import { logger } from "../../../lib/logging";
import { pipe } from "fp-ts/lib/function";
import { authorizeSession, ICloudSessionValidated } from "../../authorization/authorize";
import { fetchClient, FetchClientEither } from "../../../lib/fetch-client";
import * as TE from 'fp-ts/lib/TaskEither';
import { input } from "../../../lib/input";
import { error, InvalidGlobalSessionResponse } from "../../../lib/errors";
import { download } from "../requests/download";
import { retrieveItemDetailsInFolders } from '../requests/retrieveItemDetailsInFolders';
import { createFolders } from '../requests/createFolders';
import { moveItemsToTrash } from '../requests/moveItemsToTrash';
import * as fs from 'fs/promises'
import mime from 'mime-types'
import Path from 'path'
import { singleFileUpload, updateDocuments, upload } from '../requests/upload';

const getContentType = (extension: string): string => {
    if (extension === '') {
        return ''
    }

    const t = mime.contentType(extension)

    if (t === false) {
        return ''
    }

    return t
}

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

    private retryingQuery = <E extends Error, A>(
        te: () => TE.TaskEither<E, A>
    ): TE.TaskEither<Error, A> => {
        return pipe(
            te(),
            TE.orElseW(e => {
                return InvalidGlobalSessionResponse.is(e)
                    ? pipe(
                        this.onInvalidSession(),
                        TE.chainW(() => this.retryingQuery(te))
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

    public upload = (
        sourceFilePath: string,
        targetId: string
    ) => {
        const parsedSource = Path.parse(sourceFilePath)

        return pipe(
            TE.Do,
            TE.bind('fstats', () => TE.tryCatch(
                () => fs.stat(sourceFilePath),
                (e) => error(`error getting file info: ${JSON.stringify(e)}`))),
            TE.bind('uploadResult', ({ fstats }) =>
                pipe(
                    () => upload(this.client, this.session, {
                        contentType: getContentType(parsedSource.ext),
                        filename: parsedSource.base,
                        size: fstats.size,
                        type: 'FILE' as const
                    }),
                    this.retryingQuery,
                    TE.filterOrElse(
                        _ => _.response.body.length > 0,
                        () => error(`empty response`)
                    ),
                )
            ),
            TE.bind('singleFileUploadResult',
                ({ uploadResult: { session, response } }) =>
                    this.retryingQuery(() =>
                        singleFileUpload(
                            this.client,
                            { session, accountData: this.session.accountData },
                            {
                                filePath: sourceFilePath,
                                url: response.body[0].url
                            }))),
            TE.bind('updateDocumentsResult', ({
                uploadResult, singleFileUploadResult: { response, session }
            }) => pipe(
                () => updateDocuments(
                    this.client,
                    { session, accountData: this.session.accountData },
                    {
                        request: {
                            allow_conflict: true,
                            command: 'add_file',
                            document_id: uploadResult.response.body[0].document_id,
                            path: {
                                starting_document_id: targetId,
                                path: parsedSource.base
                            },
                            btime: new Date().getTime(),
                            mtime: new Date().getTime(),
                            file_flags: {
                                is_executable: false,
                                is_hidden: false,
                                is_writable: true
                            },
                            data: {
                                receipt: response.body.singleFile.receipt,
                                reference_signature: response.body.singleFile.referenceChecksum,
                                signature: response.body.singleFile.fileChecksum,
                                wrapping_key: response.body.singleFile.wrappingKey,
                                size: response.body.singleFile.size,
                            }
                        }
                    }
                ),
                this.retryingQuery
            ))
        )
    }

    public retrieveItemDetailsInFolders = (drivewsids: string[]) => {

        logger.info(`retrieveItemDetailsInFolders(${drivewsids})`);

        return pipe(
            this.retryingQuery(() => retrieveItemDetailsInFolders({
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
            TE.map(_ => _.response.body)
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
            this.retryingQuery(
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
            this.retryingQuery(
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
            TE.map(_ => _.response.body)
        );
    }

    public moveItemsToTrash = (items: { drivewsid: string, etag: string }[]) => {
        return pipe(
            this.retryingQuery(
                () => moveItemsToTrash({
                    client: this.client,
                    validatedSession: this.session,
                    items
                })),
            TE.chainFirstW(({ session }) => this.setSession({
                accountData: this.session.accountData,
                session
            })),
            TE.map(_ => _.response.body)
        );
    }
}
