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
import * as ARR from './api-rte'
import { expectJson, ResponseWithSession } from './http'
import * as AR from './reader'

const uploadResponseItem = t.type({
  document_id: t.string,
  url: t.string,
  owner: t.string,
  owner_id: t.string,
})

const uploadResponse = t.array(uploadResponseItem)

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

export type UpdateDocumentsRequest = t.TypeOf<typeof updateDocumentsRequest>
export type UpdateDocumentsResponse = t.TypeOf<typeof updateDocumentsResponse>
export type SingleFileResponse = t.TypeOf<typeof singleFileResponse>
export type UploadResponse = t.TypeOf<typeof uploadResponse>
export type UploadResponseItem = t.TypeOf<typeof uploadResponseItem>

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

export const uploadARR = (
  { zone = 'com.apple.CloudDocs', contentType, filename, size, type }: {
    zone?: string
    contentType: string
    filename: string
    size: number
    type: 'FILE'
  },
): ARR.DriveApiRequest<UploadResponse> =>
  ARR.basicDriveJsonRequest(
    ({ accountData, session }) => ({
      method: 'POST',
      url: `${accountData.webservices.docws.url}/ws/${zone}/upload/web?token=${
        session.cookies['X-APPLE-WEBAUTH-TOKEN'] ?? ''
      }`,
      options: { addClientInfo: true, data: { filename, content_type: contentType, size, type } },
    }),
    uploadResponse.decode,
  )

export const singleFileUploadARR = (
  { filePath, url }: { filePath: string; url: string },
): ARR.DriveApiRequest<SingleFileResponse> => {
  const filename = Path.parse(filePath).base

  return pipe(
    TE.tryCatch(
      () => fs.readFile(filePath),
      (e) => err(`error opening file ${String(e)}`),
    ),
    logf(`singleFileUpload.`, apiLogger.debug),
    TE.map((buffer) => uploadFileRequest(url, filename, buffer)),
    ARR.fromTaskEither,
    ARR.handleResponse(ARR.basicJsonResponse(singleFileResponse.decode)),
  )
}

export const updateDocumentsARR = (
  { zone = 'com.apple.CloudDocs', data }: { zone?: string; data: UpdateDocumentsRequest },
): ARR.DriveApiRequest<UpdateDocumentsResponse> =>
  ARR.basicDriveJsonRequest(
    ({ accountData }) => ({
      method: 'POST',
      url: `${accountData.webservices.docws.url}/ws/${zone}/update/documents?errorBreakdown=true`,
      options: { addClientInfo: true, data },
    }),
    updateDocumentsResponse.decode,
  )
