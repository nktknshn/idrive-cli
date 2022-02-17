import * as A from 'fp-ts/lib/Array'
import { apply, constVoid, flow, pipe } from 'fp-ts/lib/function'
import * as P from 'fp-ts/lib/pipeable'
import * as R from 'fp-ts/lib/Reader'
import * as RTE from 'fp-ts/lib/ReaderTaskEither'
import * as SRTE from 'fp-ts/lib/StateReaderTaskEither'
import * as TE from 'fp-ts/lib/TaskEither'
import * as fs from 'fs/promises'
import mime from 'mime-types'
import { capDelay, exponentialBackoff, limitRetries, Monoid, RetryStatus } from 'retry-ts'
import { retrying } from 'retry-ts/Task'
import { err, InvalidGlobalSessionError } from '../../lib/errors'
import { FetchClientEither, FetchError } from '../../lib/http/fetch-client'
import { NEA } from '../../lib/types'
import { Path } from '../../lib/util'
import { authorizeSessionM, ICloudSessionValidated } from '../authorization/authorize'
import { AccountLoginResponseBody } from '../authorization/types'
import { ICloudSession } from '../session/session'
import { getMissedFound } from './helpers'
import * as AR from './requests/api-rte'
import { renameItemsARR } from './requests/rename'
// import * as AR from './requests/reader'
import { mapFst } from 'fp-ts/lib/ReadonlyTuple'
import { getMonoid } from 'fp-ts/lib/Record'
import { last } from 'fp-ts/lib/Semigroup'
import * as RQ from './requests'
import { createFoldersARR } from './requests/createFolders'
import { downloadARR } from './requests/download'
import { moveItemsARR } from './requests/moveItems'
import { moveItemsToTrashARR } from './requests/moveItemsToTrash'
import { retrieveItemDetailsInFoldersARR } from './requests/retrieveItemDetailsInFolders'
import { putBackItemsFromTrashARR, retrieveTrashDetailsARR } from './requests/retrieveTrashDetails'
import * as T from './requests/types/types'
import {
  singleFileUploadARR,
  updateDocumentsARR,
  uploadARR,
  UploadResponse,
  UploadResponseItem,
} from './requests/upload'

export type ApiEnv = {
  retries: number
  fetch: FetchClientEither
  getCode: () => TE.TaskEither<Error, string>
}

export type Api<A> = R.Reader<ApiEnv, AR.DriveApiRequest<A>>

// export const of = <A>(v: A): Api<A> => () => AR.of(v)

const onInvalidSession = (): AR.ApiSessionRequest<
  readonly [AccountLoginResponseBody, ICloudSession]
> => {
  return pipe(
    AR.asks(env => authorizeSessionM()(env)),
    RTE.map(([accountData, { session }]) => [accountData, session]),
  )
}

const catchFetchErrors = (triesLeft: number) =>
  <T>(
    m: AR.ApiSessionRequest<T>,
  ): AR.ApiSessionRequest<T> => {
    return pipe(
      m,
      AR.orElse((e) => {
        return FetchError.is(e) && triesLeft > 0
          ? catchFetchErrors(triesLeft - 1)(m)
          : RTE.left(e)
      }),
    )
  }

const catchInvalidSession = <T>(
  m: AR.ApiSessionRequest<T>,
): AR.ApiSessionRequest<T> => {
  return pipe(
    m,
    AR.orElse((e) => {
      return InvalidGlobalSessionError.is(e)
        ? pipe(
          onInvalidSession(),
          AR.chain(([accountData, session]) =>
            pipe(
              m,
              RTE.local(env => ({ ...env, accountData, session })),
            )
          ),
        )
        : RTE.left(e)
    }),
  )
}

const executeRequest = <TArgs extends unknown[], R, S extends AR.State>(
  f: (...args: TArgs) => AR.ApiSessionRequest<R>,
): (...args: TArgs) => R.Reader<ApiEnv, AR.ApiSessionRequest<R>> =>
  (...args: TArgs) =>
    R.asks(({ retries }) =>
      pipe(
        f(...args),
        catchFetchErrors(retries),
        catchInvalidSession,
      )
    )

const executeRequest2 = (env: ApiEnv) =>
  <R, S extends AR.State>(
    ma: AR.ApiSessionRequest<R>,
  ) =>
    pipe(
      ma,
      catchFetchErrors(env.retries),
      catchInvalidSession,
    )

export const renameItemsM = flow(
  executeRequest(renameItemsARR),
  // executeRequest2({ retries: 3 }),
)

export const putBackItemsFromTrash = flow(
  executeRequest(putBackItemsFromTrashARR),
)

export const retrieveTrashDetails = flow(
  executeRequest(retrieveTrashDetailsARR),
)

export const retrieveItemDetailsInFolders = flow(
  executeRequest(retrieveItemDetailsInFoldersARR),
)

export const retrieveItemDetailsInFoldersO = flow(
  retrieveItemDetailsInFolders,
  R.map(flow(AR.map(mapFst(A.map(T.invalidIdToOption))))),
)

export const retrieveItemDetailsInFoldersS = (drivewsids: string[]) =>
  pipe(
    retrieveItemDetailsInFolders({ drivewsids }),
    R.map(AR.map(mapFst(ds => getMissedFound(drivewsids, ds)))),
  )

export const retrieveItemDetailsInFolder = (drivewsid: string) =>
  flow(
    retrieveItemDetailsInFolders({ drivewsids: [drivewsid] }),
  )

export const download = flow(
  executeRequest(downloadARR),
  R.map(AR.map(mapFst(_ => _.data_token.url))),
)

export const createFolders = flow(
  executeRequest(createFoldersARR),
)

export const moveItems = flow(
  executeRequest(moveItemsARR),
)

export const renameItems = flow(
  executeRequest(renameItemsARR),
)

export const moveItemsToTrash = flow(
  executeRequest(moveItemsToTrashARR),
)
// executeRequest
export const upload = (
  { sourceFilePath, docwsid, fname }: { sourceFilePath: string; docwsid: string; fname?: string },
) =>
  (env: ApiEnv) => {
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
      // RTE.of<ICloudSessionValidated, AR.Env, Error, {}>({}),
      RTE.Do,
      RTE.bind('fstats', () =>
        RTE.fromTaskEither(TE.tryCatch(
          () => fs.stat(sourceFilePath),
          (e) => err(`error getting file info: ${JSON.stringify(e)}`),
        ))),
      RTE.bind('uploadResult', ({ fstats }) =>
        pipe(
          uploadARR({
            contentType: getContentType(parsedSource.ext),
            filename: parsedSource.base,
            size: fstats.size,
            type: 'FILE',
          }),
          RTE.filterOrElse(
            (_) => _.length > 0,
            () => err(`empty response`),
          ),
          retrying,
        )),
      RTE.bind(
        'singleFileUploadResult',
        ({ uploadResult: [res, session] }) =>
          retrying(
            pipe(
              singleFileUploadARR(
                { filePath: sourceFilePath, url: res[0].url },
              ),
              RTE.local(c => ({ ...c, ...session })),
            ),
          ),
      ),
      RTE.bind(
        'updateDocumentsResult',
        ({ uploadResult: [uploadResult], singleFileUploadResult: [singleFileUploadResult, session] }) =>
          retrying(
            updateDocumentsARR(
              {
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
      // RTE.map(({ updateDocumentsResult }) => updateDocumentsResult.results[0].document),
    )
  }
