import { identity, pipe } from "fp-ts/lib/function";
import * as O from 'fp-ts/lib/Option';
import * as R from 'fp-ts/lib/Record';
import * as TE from 'fp-ts/lib/TaskEither';
import * as fs from 'fs/promises';
import Path from 'path';
import { basicGetResponse, createHttpResponseReducer, ResponseWithSession, validateJsonAndApply } from "../../../lib/response-reducer";
import { error } from "../../../lib/errors";
import { FetchClientEither, HttpResponse } from "../../../lib/fetch-client";
import { hasOwnProperty, isObjectWithOwnProperty } from "../../../lib/util";
import { ICloudSessionValidated } from "../../authorization/authorize";
import { ICloudSessionState } from "../../session/session";
import { getBasicRequest, uploadFileRequest } from "../../session/session-http";

// https://p46-docws.icloud.com/ws/com.apple.CloudDocs/upload/web?token=<TOKEN>>&clientBuildNumber=2118Project41&clientMasteringNumber=2118B32&clientId=4dbe4e18-9b69-4a1f-af46-a54bb84caff5&dsid=20322967922

type UploadResponse = [
    { document_id: string, url: string, owner: string, owner_id: string }
]

type SingleFileResponse = {
    singleFile: {
        referenceChecksum: string,
        fileChecksum: string,
        wrappingKey: string,
        receipt: string,
        size: number,
    }
}


type Status = {
    status_code: number,
    error_message: string
}

type UpdateDocumentsResponse = {
    status: Status,
    results: {
        status: Status,
        operation_id: null,
        document: {
            status: Status,
            etag: string,
            // etc...
        }
    }[]
}

type UpdateDocumentsRequest = {
    allow_conflict: boolean,
    btime: number,
    mtime: number,
    command: 'add_file',
    document_id: string,
    file_flags: {
        is_executable: boolean,
        is_hidden: boolean,
        is_writable: boolean,
    },
    path: {
        path: string,
        starting_document_id: string
    },
    data: {
        receipt: string,
        reference_signature: string,
        signature: string,
        wrapping_key: string,
        size: number,
    },
    [other: string]: unknown
}

export function upload(
    client: FetchClientEither,
    { session, accountData }: ICloudSessionValidated,
    { zone = 'com.apple.CloudDocs', contentType, filename, size, type }: {
        zone?: string,
        contentType: string,
        filename: string,
        size: number,
        type: 'FILE'
    }
) {

    const applyUploadResponse = validateJsonAndApply(
        (json: unknown): json is UploadResponse =>
            Array.isArray(json) && (!json.length || isObjectWithOwnProperty(json[0], 'url'))
    )

    // const token = pipe(
    //     session.cookies,
    //     R.lookup('X-APPLE-WEBAUTH-TOKEN'),
    //     O.map(_ => _.value),
    //     O.fold(() => "", identity)
    // )

    const token = session.cookies['X-APPLE-WEBAUTH-TOKEN'] ?? ''

    return pipe(
        session,
        getBasicRequest(
            'POST',
            `${accountData.webservices.docws.url}/ws/${zone}/upload/web?token=${token}&clientBuildNumber=2118Project41&clientMasteringNumber=2118B32&clientId=f4058d20-0430-4cd5-bb85-7eb9b47fc94e`,
            { data: { filename, content_type: contentType, size, type } }
        ),
        client,
        TE.chainW(applyUploadResponse(session)),
    )
}

export function singleFileUpload(
    client: FetchClientEither,
    { session }: ICloudSessionValidated,
    { filePath, url }: {
        filePath: string,
        url: string
    }
): TE.TaskEither<Error, ResponseWithSession<SingleFileResponse>> {

    const filename = Path.parse(filePath).base

    const applySingleFileResponse =
        validateJsonAndApply((json: unknown): json is SingleFileResponse =>
            isObjectWithOwnProperty(json, 'singleFile')
        )

    return pipe(
        TE.tryCatch(() => fs.readFile(filePath), (e) => error(`error opening file ${String(e)}`)),
        TE.map(buffer => uploadFileRequest(url, filename, buffer)),
        TE.chainW(client),
        TE.chainW(applySingleFileResponse(session)),
    )
}

export function updateDocuments(
    client: FetchClientEither,
    { session, accountData }: ICloudSessionValidated,
    { zone = 'com.apple.CloudDocs', request }: {
        zone?: string,
        request: UpdateDocumentsRequest
    }
): TE.TaskEither<Error, ResponseWithSession<UpdateDocumentsResponse>> {
    const applyToSession =
        validateJsonAndApply(
            (json: unknown): json is UpdateDocumentsResponse =>
                isObjectWithOwnProperty(json, 'status') &&
                isObjectWithOwnProperty(json.status, 'status_code')
                && json.status.status_code === 0 &&
                hasOwnProperty(json, 'results')
                && Array.isArray(json.results) && json.results.length > 0
        )

    return pipe(
        session,
        getBasicRequest(
            'POST',
            `${accountData.webservices.docws.url}/ws/${zone}/update/documents?clientBuildNumber=2118Project41&clientMasteringNumber=2118B32&clientId=f4058d20-0430-4cd5-bb85-7eb9b47fc94e&appIdentifier=iclouddrive`,
            request
        ),
        client,
        TE.chainW(applyToSession(session)),
    )
}