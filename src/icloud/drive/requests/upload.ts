import { pipe } from 'fp-ts/lib/function'
import * as TE from 'fp-ts/lib/TaskEither'
import * as fs from 'fs/promises'
import * as t from 'io-ts'
import Path from 'path'
import { err } from '../../../lib/errors'
import { FetchClientEither, uploadFileRequest } from '../../../lib/http/fetch-client'
import { apiLogger, logf } from '../../../lib/logging'
import { ICloudSessionValidated } from '../../authorization/authorize'
import { buildRequest } from '../../session/session-http'
import { expectJson, ResponseWithSession } from './http'
import * as AR from './reader'

const uploadResponse = t.array(t.type({
  document_id: t.string,
  url: t.string,
  owner: t.string,
  owner_id: t.string,
}))

const singleFileResponse = t.type({
  singleFile: t.type({
    referenceChecksum: t.string,
    fileChecksum: t.string,
    wrappingKey: t.string,
    receipt: t.string,
    size: t.number,
  }),
})

const status = t.type({
  status_code: t.number,
  error_message: t.string,
})

// type Status = t.TypeOf<typeof status>

const updateDocumentsResponse = t.type({
  status,
  results: t.array(t.type(
    {
      status,
      operation_id: t.null,
      document: t.type({
        status,
        etag: t.string,
        zone: t.string,
        type: t.string,
        document_id: t.string,
        parent_id: t.string,
        mtime: t.number,
        // etc...
      }),
    },
  )),
})

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
})

type UpdateDocumentsRequest = t.TypeOf<typeof updateDocumentsRequest>
type UpdateDocumentsResponse = t.TypeOf<typeof updateDocumentsResponse>
type SingleFileResponse = t.TypeOf<typeof singleFileResponse>
type UploadResponse = t.TypeOf<typeof uploadResponse>

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
    logf(`upload.`, apiLogger.debug),
    buildRequest(
      'POST',
      `${accountData.webservices.docws.url}/ws/${zone}/upload/web?token=${token}`,
      { addClientInfo: true, data: { filename, content_type: contentType, size, type } },
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

  return pipe(
    TE.tryCatch(
      () => fs.readFile(filePath),
      (e) => err(`error opening file ${String(e)}`),
    ),
    logf(`singleFileUpload.`, apiLogger.debug),
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
    logf(`updateDocuments.`, apiLogger.debug),
    buildRequest(
      'POST',
      `${accountData.webservices.docws.url}/ws/${zone}/update/documents?errorBreakdown=true`,
      { addClientInfo: true, data },
    ),
    client,
    expectJson(updateDocumentsResponse.decode)(session),
  )
}

export const uploadM = (
  { zone = 'com.apple.CloudDocs', contentType, filename, size, type }: {
    zone?: string
    contentType: string
    filename: string
    size: number
    type: 'FILE'
  },
): AR.DriveApiRequest<UploadResponse> =>
  AR.basicDriveJsonRequest(
    ({ state: { accountData, session } }) => ({
      method: 'POST',
      url: `${accountData.webservices.docws.url}/ws/${zone}/upload/web?token=${
        session.cookies['X-APPLE-WEBAUTH-TOKEN'] ?? ''
      }`,
      options: { addClientInfo: true, data: { filename, content_type: contentType, size, type } },
    }),
    uploadResponse.decode,
  )

export const singleFileUploadM = (
  { filePath, url }: { filePath: string; url: string },
): AR.DriveApiRequest<SingleFileResponse> => {
  const filename = Path.parse(filePath).base

  return pipe(
    TE.tryCatch(
      () => fs.readFile(filePath),
      (e) => err(`error opening file ${String(e)}`),
    ),
    logf(`singleFileUpload.`, apiLogger.debug),
    TE.map((buffer) => uploadFileRequest(url, filename, buffer)),
    AR.fromTaskEither,
    AR.handleResponse(AR.basicJsonResponse(singleFileResponse.decode)),
  )
}

export const updateDocumentsM = (
  { zone = 'com.apple.CloudDocs', data }: { zone?: string; data: UpdateDocumentsRequest },
): AR.DriveApiRequest<UpdateDocumentsResponse> =>
  AR.basicDriveJsonRequest(
    ({ state: { accountData } }) => ({
      method: 'POST',
      url: `${accountData.webservices.docws.url}/ws/${zone}/update/documents?errorBreakdown=true`,
      options: { addClientInfo: true, data },
    }),
    updateDocumentsResponse.decode,
  )
