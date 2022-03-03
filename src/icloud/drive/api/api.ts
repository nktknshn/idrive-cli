import { flow, pipe } from 'fp-ts/lib/function'
import * as RTE from 'fp-ts/lib/ReaderTaskEither'
import * as SRTE from 'fp-ts/lib/StateReaderTaskEither'
import * as TE from 'fp-ts/lib/TaskEither'
import { Readable } from 'stream'
import { defaultApiEnv } from '../../../defaults'
import { err, InvalidGlobalSessionError } from '../../../lib/errors'
import { expectResponse, fetchClient } from '../../../lib/http/fetch-client'
import { XX, XXX, XXXX } from '../../../lib/types'
import { AuthorizedState, authorizeSessionM as authorizeSessionM_ } from '../../authorization/authorize'
import { AccountLoginResponseBody } from '../../authorization/types'
import { upload as upload_, UploadResult } from '../api'
import * as RQ from '../requests'
import { BasicState, RequestEnv } from '../requests/request'
import { ApiType } from './type'

const inject = <S extends AuthorizedState, TArgs extends unknown[], A>(
  f: <S extends AuthorizedState>(...args: TArgs) => XXX<S, RequestEnv, A>,
): (...args: TArgs) => XX<S, A> => {
  const action = (...args: TArgs): XX<S, A> => (s: S) => () => f<S>(...args)(s)(defaultApiEnv)

  return (...args: TArgs) => {
    return ((s: S) =>
      () =>
        pipe(
          action(...args)(s)({}),
          TE.orElse(e =>
            InvalidGlobalSessionError.is(e)
              ? pipe(
                authorizeSessionM<S>()(s)({}),
                TE.chain(
                  ([accountData, state]) => action(...args)({ ...state, accountData })({}),
                ),
              )
              : TE.left(e)
          ),
        ))
  }
}

function getUrlStream(
  { url }: { url: string },
): TE.TaskEither<Error, Readable> {
  return pipe(
    fetchClient({ method: 'GET', url, headers: {}, data: undefined, responseType: 'stream' }),
    expectResponse(
      _ => _.status == 200,
      _ => err(`responded ${_.status}`),
    ),
    TE.map(_ => _.data as Readable),
  )
}

const authorizeSessionM = <S extends BasicState>(): XX<S, AccountLoginResponseBody> => {
  return (s: S) => () => authorizeSessionM_<S>()(s)(defaultApiEnv)
}

const upload = <S extends AuthorizedState>(
  { sourceFilePath, docwsid, fname, zone }: { zone: string; sourceFilePath: string; docwsid: string; fname?: string },
): XX<S, UploadResult> => {
  return (s: S) => () => upload_<S>({ sourceFilePath, docwsid, fname, zone })(s)(defaultApiEnv)
}

export const api: ApiType = {
  retrieveItemDetailsInFolders: inject(RQ.retrieveItemDetailsInFolders),
  createFoldersM: inject(RQ.createFoldersM),
  downloadBatchM: inject(RQ.downloadBatchM),
  fetchClient: fetchClient,
  downloadM: inject(RQ.downloadM),
  renameItemsM: inject(RQ.renameItemsM),
  putBackItemsFromTrashM: inject(RQ.putBackItemsFromTrashM),
  moveItemsM: inject(RQ.moveItemsM),
  getUrlStream: getUrlStream,
  moveItemsToTrashM: inject(RQ.moveItemsToTrashM),
  upload,
  authorizeSessionM,
}
