import * as A from 'fp-ts/lib/Array'
import { constVoid, flow, pipe } from 'fp-ts/lib/function'
import * as R from 'fp-ts/lib/Reader'
import * as SRTE from 'fp-ts/lib/StateReaderTaskEither'
import * as TE from 'fp-ts/lib/TaskEither'
import * as fs from 'fs/promises'
import mime from 'mime-types'
import { err, InvalidGlobalSessionError } from '../../lib/errors'
import { FetchClientEither, FetchError } from '../../lib/http/fetch-client'
import { NEA } from '../../lib/types'
import { Path } from '../../lib/util'
import { AuthorizedState, authorizeSessionM } from '../authorization/authorize'
import { getMissedFound } from './helpers'
import * as RQ from './requests'
// import * as AR from './requests/api-rte'
import * as AR from './requests/request'
import * as T from './requests/types/types'
import { UploadResponseItem } from './requests/upload'

export type ApiEnv = {
  retries: number
}

export type Api<A> = R.Reader<ApiEnv, AR.AuthorizedRequest<A>>

export const of = <A>(v: A): Api<A> => () => AR.of(v)

const onInvalidSession = <S extends AR.State>(): AR.ApiRequest<void, S> => {
  return pipe(
    authorizeSessionM<S>(),
    AR.chain((accountData) => SRTE.modify(s => ({ ...s, accountData }))),
    AR.map(constVoid),
  )
}

const catchFetchErrors = (triesLeft: number) =>
  <T, S extends AR.State>(
    m: AR.ApiRequest<T, S>,
  ): AR.ApiRequest<T, S> => {
    return pipe(
      m,
      AR.orElse((e) => {
        return FetchError.is(e) && triesLeft > 0
          ? catchFetchErrors(triesLeft - 1)(m)
          : SRTE.left(e)
      }),
    )
  }

const catchInvalidSession = <T, S extends AR.State>(
  m: AR.ApiRequest<T, S>,
): AR.ApiRequest<T, S> => {
  return pipe(
    m,
    AR.orElse((e) => {
      return InvalidGlobalSessionError.is(e)
        ? pipe(
          onInvalidSession<S>(),
          AR.chain(() => m),
        )
        : SRTE.left(e)
    }),
  )
}

const executeRequest = <TArgs extends unknown[], R, S extends AR.State>(
  f: (...args: TArgs) => AR.ApiRequest<R, S>,
): (...args: TArgs) => R.Reader<ApiEnv, AR.ApiRequest<R, S>> =>
  (...args: TArgs) =>
    R.asks(({ retries }) =>
      pipe(
        f(...args),
        catchFetchErrors(retries),
        catchInvalidSession,
      )
    )

const executeRequest2 = (env: { retries: number }) =>
  <R, S extends AR.State>(
    ma: AR.ApiRequest<R, S>,
  ) =>
    pipe(
      ma,
      catchFetchErrors(env.retries),
      catchInvalidSession,
    )

export const renameItemsM = flow(
  executeRequest(RQ.renameItemsM),
  // executeRequest2({ retries: 3 }),
)

export const putBackItemsFromTrash = flow(
  executeRequest(RQ.putBackItemsFromTrashM),
)

export const retrieveTrashDetails = flow(
  executeRequest(RQ.retrieveTrashDetailsM),
)

export const retrieveItemDetailsInFolders = flow(
  executeRequest(RQ.retrieveItemDetailsInFolders),
)

export const retrieveItemDetailsInFoldersO = flow(
  retrieveItemDetailsInFolders,
  R.map(flow(AR.map(A.map(T.invalidIdToOption)))),
)

export const retrieveItemDetailsInFoldersS = (drivewsids: string[]) =>
  pipe(
    retrieveItemDetailsInFolders({ drivewsids }),
    R.map(AR.map(ds => getMissedFound(drivewsids, ds))),
  )

export const retrieveItemDetailsInFolder = (drivewsid: string) =>
  flow(
    retrieveItemDetailsInFolders({ drivewsids: [drivewsid] }),
  )

export const download = flow(
  executeRequest(RQ.downloadM),
  R.map(AR.map(_ => _.data_token?.url ?? _.package_token?.url)),
)

export const downloadBatch = flow(
  executeRequest(RQ.downloadBatchM),
  R.map(AR.map(A.map(_ => _.data_token?.url ?? _.package_token?.url))),
)

export const createFolders = flow(
  executeRequest(RQ.createFoldersM),
)

export const moveItems = flow(
  executeRequest(RQ.moveItemsM),
)

export const renameItems = flow(
  executeRequest(RQ.renameItemsM),
)

export const moveItemsToTrash = flow(
  executeRequest(RQ.moveItemsToTrashM),
)

export const upload = (
  { sourceFilePath, docwsid, fname, zone }: { zone: string; sourceFilePath: string; docwsid: string; fname?: string },
) =>
  (env: { retries: number }) => {
    const parsedSource = fname ? Path.parse(fname) : Path.parse(sourceFilePath)

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

    const retrying = executeRequest2(env)

    return pipe(
      AR.Do<AuthorizedState>(),
      SRTE.bind('fstats', () =>
        AR.fromTaskEither(TE.tryCatch(
          () => fs.stat(sourceFilePath),
          (e) => err(`error getting file info: ${JSON.stringify(e)}`),
        ))),
      SRTE.bind('uploadResult', ({ fstats }) =>
        pipe(
          RQ.uploadM({
            contentType: getContentType(parsedSource.ext),
            filename: parsedSource.base,
            size: fstats.size,
            type: 'FILE',
            zone,
          }),
          SRTE.filterOrElse(
            (_): _ is NEA<UploadResponseItem> => _.length > 0,
            () => err(`empty response`),
          ),
          retrying,
        )),
      SRTE.bind(
        'singleFileUploadResult',
        ({ uploadResult }) =>
          retrying(
            RQ.singleFileUploadM(
              { filePath: sourceFilePath, url: uploadResult[0].url },
            ),
          ),
      ),
      SRTE.bind(
        'updateDocumentsResult',
        ({ uploadResult, singleFileUploadResult }) =>
          retrying(
            RQ.updateDocumentsM(
              {
                zone,
                data: {
                  allow_conflict: true,
                  command: 'add_file',
                  document_id: uploadResult[0].document_id,
                  path: {
                    starting_document_id: docwsid,
                    path: parsedSource.base,
                  },
                  btime: new Date().getTime(),
                  mtime: new Date().getTime(),
                  file_flags: {
                    is_executable: false,
                    is_hidden: false,
                    is_writable: true,
                  },
                  data: {
                    receipt: singleFileUploadResult.singleFile.receipt,
                    reference_signature: singleFileUploadResult.singleFile.referenceChecksum,
                    signature: singleFileUploadResult.singleFile.fileChecksum,
                    wrapping_key: singleFileUploadResult.singleFile.wrappingKey,
                    size: singleFileUploadResult.singleFile.size,
                  },
                },
              },
            ),
          ),
      ),
      SRTE.map(({ updateDocumentsResult }) => updateDocumentsResult.results[0].document),
    )
  }

export const uploadSimple = (
  { sourceFilePath, docwsid, fname, zone }: { zone: string; sourceFilePath: string; docwsid: string; fname?: string },
): AR.ApiRequest<
  {
    status: {
      status_code: number
      error_message: string
    }
    etag: string
    zone: string
    type: string
    document_id: string
    parent_id: string
    mtime: number
  },
  AuthorizedState,
  AR.RequestEnv
> => {
  const parsedSource = fname ? Path.parse(fname) : Path.parse(sourceFilePath)

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

  return pipe(
    AR.Do<AuthorizedState>(),
    SRTE.bind('fstats', () =>
      AR.fromTaskEither(TE.tryCatch(
        () => fs.stat(sourceFilePath),
        (e) => err(`error getting file info: ${JSON.stringify(e)}`),
      ))),
    SRTE.bind('uploadResult', ({ fstats }) =>
      pipe(
        RQ.uploadM({
          contentType: getContentType(parsedSource.ext),
          filename: parsedSource.base,
          size: fstats.size,
          type: 'FILE',
          zone,
        }),
        SRTE.filterOrElse(
          (_): _ is NEA<UploadResponseItem> => _.length > 0,
          () => err(`empty response`),
        ),
      )),
    SRTE.bind(
      'singleFileUploadResult',
      ({ uploadResult }) =>
        RQ.singleFileUploadM(
          { filePath: sourceFilePath, url: uploadResult[0].url },
        ),
    ),
    SRTE.bind(
      'updateDocumentsResult',
      ({ uploadResult, singleFileUploadResult }) =>
        RQ.updateDocumentsM(
          {
            zone,
            data: {
              allow_conflict: true,
              command: 'add_file',
              document_id: uploadResult[0].document_id,
              path: {
                starting_document_id: docwsid,
                path: parsedSource.base,
              },
              btime: new Date().getTime(),
              mtime: new Date().getTime(),
              file_flags: {
                is_executable: false,
                is_hidden: false,
                is_writable: true,
              },
              data: {
                receipt: singleFileUploadResult.singleFile.receipt,
                reference_signature: singleFileUploadResult.singleFile.referenceChecksum,
                signature: singleFileUploadResult.singleFile.fileChecksum,
                wrapping_key: singleFileUploadResult.singleFile.wrappingKey,
                size: singleFileUploadResult.singleFile.size,
              },
            },
          },
        ),
    ),
    SRTE.map(({ updateDocumentsResult }) => updateDocumentsResult.results[0].document),
  )
}

export const api = {
  renameItemsM,
  putBackItemsFromTrash,
  retrieveTrashDetails,
  retrieveItemDetailsInFolders,
  retrieveItemDetailsInFoldersO,
  retrieveItemDetailsInFoldersS,
  retrieveItemDetailsInFolder,
  download,
  downloadBatch,
  createFolders,
  moveItems,
  renameItems,
  moveItemsToTrash,
  upload,
}