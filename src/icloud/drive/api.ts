import * as A from 'fp-ts/lib/Array'
import { constVoid, flow, pipe } from 'fp-ts/lib/function'
import * as NA from 'fp-ts/lib/NonEmptyArray'
import * as SRTE from 'fp-ts/lib/StateReaderTaskEither'
import * as TE from 'fp-ts/lib/TaskEither'
import * as fs from 'fs/promises'
import mime from 'mime-types'
import { err, InvalidGlobalSessionError } from '../../lib/errors'
import { FetchError } from '../../lib/http/fetch-client'
import { Path } from '../../lib/util'
import { authorizeSessionSRTE, ICloudSessionValidated } from '../authorization/authorize'
import { getMissedFound } from './helpers'
import * as RQ from './requests'
// import * as AR from './requests/api-rte'
import * as AR from './requests/request'
import * as T from './requests/types/types'

export type ApiEnv = {
  retries: number
}

export type Api<A, S = ICloudSessionValidated, R = AR.Env> = AR.AuthorizedRequest<A, S, R & ApiEnv>

export const of = <A>(v: A): Api<A> => AR.of(v)

const onInvalidSession = <S extends ICloudSessionValidated, R extends AR.Env>(): AR.ApiRequest<void, S, R> => {
  return pipe(
    authorizeSessionSRTE<S>(),
    AR.map(constVoid),
  )
}

const catchFetchErrors3 = (triesLeft: number) =>
  <A, R>(
    m: TE.TaskEither<Error, A>,
  ): TE.TaskEither<Error, A> => {
    return pipe(
      m,
      TE.orElse((e) =>
        FetchError.is(e) && triesLeft > 0
          ? catchFetchErrors3(triesLeft - 1)(m)
          : TE.left(e)
      ),
    )
  }

const executeRequest4 = <TArgs extends unknown[], A, S extends ICloudSessionValidated, R extends AR.Env>(
  f: (...args: TArgs) => AR.ApiRequest<A, S, R>,
): (...args: TArgs) => SRTE.StateReaderTaskEither<S, { retries: number } & R, Error, A> => {
  return (...args: TArgs) =>
    (s: S) =>
      (r: { retries: number } & R) =>
        pipe(
          f(...args)(s)(r),
          catchFetchErrors3(r.retries),
          TE.orElse(e =>
            InvalidGlobalSessionError.is(e)
              ? pipe(
                onInvalidSession<S, R>()(s)(r),
                TE.chain(([, s]) => f(...args)(s)(r)),
              )
              : TE.left(e)
          ),
        )
}

export const renameItemsM = flow(
  executeRequest4(RQ.renameItemsM),
)

export const putBackItemsFromTrash = flow(
  executeRequest4(RQ.putBackItemsFromTrashM),
)

export const retrieveTrashDetails = flow(
  executeRequest4(RQ.retrieveTrashDetailsM),
)

export const retrieveItemDetailsInFolders = flow(
  executeRequest4(RQ.retrieveItemDetailsInFolders),
)

export const retrieveItemDetailsInFoldersO = flow(
  retrieveItemDetailsInFolders,
  flow(AR.map(NA.map(T.invalidIdToOption))),
)

export const retrieveItemDetailsInFoldersS = <S extends ICloudSessionValidated, R extends AR.Env>(
  drivewsids: string[],
) =>
  pipe(
    retrieveItemDetailsInFolders<S, R>({ drivewsids }),
    AR.map(ds => getMissedFound(drivewsids, ds)),
  )

export const retrieveItemDetailsInFolder = <S extends ICloudSessionValidated, R extends AR.Env>(
  drivewsid: string,
): SRTE.StateReaderTaskEither<S, { retries: number } & R, Error, (T.Details | T.InvalidId)> =>
  pipe(
    retrieveItemDetailsInFolders<S, R>({ drivewsids: [drivewsid] }),
    AR.map(NA.head),
  )

export const download = flow(
  executeRequest4(RQ.downloadM),
  AR.map(_ => _.data_token?.url ?? _.package_token?.url),
)

export const download4 = flow(
  executeRequest4(RQ.downloadM),
  AR.map(_ => _.data_token?.url ?? _.package_token?.url),
)

export const downloadBatch = flow(
  executeRequest4(RQ.downloadBatchM),
  AR.map(A.map(_ => _.data_token?.url ?? _.package_token?.url)),
)

export const createFolders = flow(
  executeRequest4(RQ.createFoldersM),
)

export const moveItems = flow(
  executeRequest4(RQ.moveItemsM),
)

export const renameItems = flow(
  executeRequest4(RQ.renameItemsM),
)

export const moveItemsToTrash = flow(
  executeRequest4(RQ.moveItemsToTrashM),
)

export const upload = <S extends ICloudSessionValidated>(
  { sourceFilePath, docwsid, fname, zone }: { zone: string; sourceFilePath: string; docwsid: string; fname?: string },
) => {
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

  // const retrying = executeRequest2(env)

  return pipe(
    AR.Do<ICloudSessionValidated>(),
    SRTE.bindW('fstats', () =>
      SRTE.fromTaskEither(TE.tryCatch(
        () => fs.stat(sourceFilePath),
        (e) => err(`error getting file info: ${JSON.stringify(e)}`),
      ))),
    SRTE.bindW('uploadResult', ({ fstats }) =>
      pipe(
        executeRequest4(RQ.uploadM)({
          contentType: getContentType(parsedSource.ext),
          filename: parsedSource.base,
          size: fstats.size,
          type: 'FILE',
          zone,
        }),
        SRTE.filterOrElse(A.isNonEmpty, () => err(`empty response`)),
        // retrying,
      )),
    SRTE.bindW(
      'singleFileUploadResult',
      ({ uploadResult }) =>
        executeRequest4(RQ.singleFileUploadM)(
          { filePath: sourceFilePath, url: uploadResult[0].url },
        ),
    ),
    SRTE.bindW(
      'updateDocumentsResult',
      ({ uploadResult, singleFileUploadResult }) =>
        executeRequest4(
          RQ.updateDocumentsM,
        )(
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
