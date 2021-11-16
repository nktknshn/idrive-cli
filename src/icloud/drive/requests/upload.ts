import { pipe } from 'fp-ts/lib/function'
import * as TE from 'fp-ts/lib/TaskEither'
import * as fs from 'fs/promises'
import * as t from 'io-ts'
import Path from 'path'
import { err } from '../../../lib/errors'
import { FetchClientEither, uploadFileRequest } from '../../../lib/fetch-client'
import { ResponseWithSession } from '../../../lib/response-reducer'
import { hasOwnProperty, isObjectWithOwnProperty } from '../../../lib/util'
import { ICloudSessionValidated } from '../../authorization/authorize'
import { buildRequest } from '../../session/session-http'
import { expectJson } from './filterStatus'
// https://p46-docws.icloud.com/ws/com.apple.CloudDocs/upload/web?token=<TOKEN>>&clientBuildNumber=2118Project41&clientMasteringNumber=2118B32&clientId=4dbe4e18-9b69-4a1f-af46-a54bb84caff5&dsid=20322967922

const uploadResponse = t.array(t.type({
  document_id: t.string,
  url: t.string,
  owner: t.string,
  owner_id: t.string,
}))

type UploadResponse = t.TypeOf<typeof uploadResponse>

const singleFileResponse = t.type({
  singleFile: t.type({
    referenceChecksum: t.string,
    fileChecksum: t.string,
    wrappingKey: t.string,
    receipt: t.string,
    size: t.number,
  }),
})

type SingleFileResponse = t.TypeOf<typeof singleFileResponse>

const status = t.type({
  status_code: t.number,
  error_message: t.string,
})

type Status = t.TypeOf<typeof status>

const updateDocumentsResponse = t.type({
  status,
  results: t.array(t.type(
    {
      status,
      operation_id: t.null,
      document: t.type({
        status,
        etag: t.string,
        // etc...
      }),
    },
  )),
})

type UpdateDocumentsResponse = t.TypeOf<typeof updateDocumentsResponse>

const updateDocumentsRequest = t.type({
  allow_conflict: t.boolean,
  btime: t.number,
  mtime: t.number,
  command: t.literal('add_file'),
  document_id: t.string,
  file_flags: t.type({
    is_executable: t.boolean,
    is_hidden: t.boolean,
    is_writable: t.boolean,
  }),
  path: t.type({
    path: t.string,
    starting_document_id: t.string,
  }),
  data: t.type({
    receipt: t.string,
    reference_signature: t.string,
    signature: t.string,
    wrapping_key: t.string,
    size: t.number,
  }),
  // [other: string]: unknown
})

type UpdateDocumentsRequest = t.TypeOf<typeof updateDocumentsRequest>
/*
{
  allow_conflict: boolean
  btime: number
  mtime: number
  command: 'add_file'
  document_id: string
  file_flags: {
    is_executable: boolean
    is_hidden: boolean
    is_writable: boolean
  }
  path: {
    path: string
    starting_document_id: string
  }
  data: {
    receipt: string
    reference_signature: string
    signature: string
    wrapping_key: string
    size: number
  }
  [other: string]: unknown
} */

export function upload(
  client: FetchClientEither,
  { session, accountData }: ICloudSessionValidated,
  { zone = 'com.apple.CloudDocs', contentType, filename, size, type }: {
    zone?: string
    contentType: string
    filename: string
    size: number
    type: 'FILE'
  },
): TE.TaskEither<Error, ResponseWithSession<UploadResponse>> {
  const token = session.cookies['X-APPLE-WEBAUTH-TOKEN'] ?? ''

  return pipe(
    session,
    buildRequest(
      'POST',
      `${accountData.webservices.docws.url}/ws/${zone}/upload/web?token=${token}&clientBuildNumber=2118Project41&clientMasteringNumber=2118B32&clientId=f4058d20-0430-4cd5-bb85-7eb9b47fc94e`,
      { data: { filename, content_type: contentType, size, type } },
    ),
    client,
    expectJson(uploadResponse.decode)(session),
  )
}

export function singleFileUpload(
  client: FetchClientEither,
  { session }: ICloudSessionValidated,
  { filePath, url }: { filePath: string; url: string },
): TE.TaskEither<Error, ResponseWithSession<SingleFileResponse>> {
  const filename = Path.parse(filePath).base

  // const applySingleFileResponse = expectJson(
  //   (json: unknown): json is SingleFileResponse => isObjectWithOwnProperty(json, 'singleFile'),
  // )

  return pipe(
    TE.tryCatch(
      () => fs.readFile(filePath),
      (e) => err(`error opening file ${String(e)}`),
    ),
    TE.map((buffer) => uploadFileRequest(url, filename, buffer)),
    TE.chainW(client),
    expectJson(singleFileResponse.decode)(session),
  )
}

export function updateDocuments(
  client: FetchClientEither,
  { session, accountData }: ICloudSessionValidated,
  { zone = 'com.apple.CloudDocs', data }: { zone?: string; data: UpdateDocumentsRequest },
): TE.TaskEither<Error, ResponseWithSession<UpdateDocumentsResponse>> {
  return pipe(
    session,
    buildRequest(
      'POST',
      `${accountData.webservices.docws.url}/ws/${zone}/update/documents?clientBuildNumber=2118Project41&clientMasteringNumber=2118B32&clientId=f4058d20-0430-4cd5-bb85-7eb9b47fc94e&appIdentifier=iclouddrive&errorBreakdown=true`,
      { data },
    ),
    client,
    expectJson(updateDocumentsResponse.decode)(session),
  )
}
