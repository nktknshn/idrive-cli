import { flow, pipe } from 'fp-ts/lib/function'
import * as t from 'io-ts'
import * as AR from '../../icloud-core/icloud-request/lib/request'
import { AuthenticatedState } from '../../icloud-core/icloud-request/lib/request'
import { readWebauthToken } from '../../icloud-core/session/session-cookies'
import { debugTimeSRTE } from '../../logging/debug-time'
import { apiLoggerIO } from '../../logging/loggerIO'
import { HttpRequest, uploadFileRequest } from '../../util/http/fetch-client'
import { runLogging } from '../../util/srte-utils'

export type UpdateDocumentsRequest = {
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
}

// const updateDocumentsRequest = t.type({
//   allow_conflict: t.boolean,
//   btime: t.number,
//   mtime: t.number,
//   command: t.literal('add_file'),
//   document_id: t.string,
//   file_flags: t.type({
//     is_executable: t.boolean,
//     is_hidden: t.boolean,
//     is_writable: t.boolean,
//   }),
//   path: t.type({
//     path: t.string,
//     starting_document_id: t.string,
//   }),
//   data: t.type({
//     receipt: t.string,
//     reference_signature: t.string,
//     signature: t.string,
//     wrapping_key: t.string,
//     size: t.number,
//   }),
// })

export type UpdateDocumentsResponse = t.TypeOf<typeof updateDocumentsResponse>
export type SingleFileResponse = t.TypeOf<typeof singleFileResponse>
export type UploadResponse = t.TypeOf<typeof uploadResponse>
export type UploadResponseItem = t.TypeOf<typeof uploadResponseItem>

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

export const upload = <S extends AuthenticatedState>(
  { zone, contentType, filename, size, type }: {
    zone: string
    contentType: string
    filename: string
    size: number
    type: 'FILE'
  },
): AR.ApiRequest<UploadResponse, S> =>
  flow(
    runLogging(apiLoggerIO.debug('upload')),
    debugTimeSRTE('upload'),
  )(AR.basicJsonRequest(
    ({ state: { accountData, session } }) => ({
      method: 'POST',
      url: `${accountData.webservices.docws.url}/ws/${zone}/upload/web?token=${
        encodeURIComponent(readWebauthToken(session.cookies).t ?? '')
      }`,
      options: { addClientInfo: true, data: { filename, content_type: contentType, size, type } },
    }),
    uploadResponse.decode,
  ))

export const singleFileUpload = <S extends AuthenticatedState>(
  { buffer, url, filename }: { buffer: Buffer; url: string; filename: string },
): AR.ApiRequest<SingleFileResponse, S, AR.RequestDeps> => {
  return pipe(
    AR.of<S, AR.RequestDeps, Error, HttpRequest>(uploadFileRequest(url, filename, buffer)),
    AR.handleResponse<SingleFileResponse, S, AR.RequestDeps>(
      AR.basicJsonResponse(singleFileResponse.decode),
    ),
    runLogging(apiLoggerIO.debug('singleFileUpload')),
    debugTimeSRTE('singleFileUpload'),
  )
}

export const updateDocuments = <S extends AuthenticatedState>(
  { zone, data }: { zone: string; data: UpdateDocumentsRequest },
): AR.ApiRequest<UpdateDocumentsResponse, S> =>
  flow(
    runLogging(apiLoggerIO.debug('updateDocuments')),
    debugTimeSRTE('updateDocuments'),
  )(AR.basicJsonRequest(
    ({ state: { accountData } }) => ({
      method: 'POST',
      url: `${accountData.webservices.docws.url}/ws/${zone}/update/documents?errorBreakdown=true`,
      options: { addClientInfo: true, data },
    }),
    updateDocumentsResponse.decode,
  ))
