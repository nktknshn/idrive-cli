import * as A from 'fp-ts/lib/Array'
import { apply, constVoid, flow, pipe } from 'fp-ts/lib/function'
import * as R from 'fp-ts/lib/Reader'
import * as SRTE from 'fp-ts/lib/StateReaderTaskEither'
import { capDelay, exponentialBackoff, limitRetries, Monoid, RetryStatus } from 'retry-ts'
import { retrying } from 'retry-ts/Task'
import { InvalidGlobalSessionResponse } from '../../lib/errors'
import { FetchError } from '../../lib/http/fetch-client'
import { authorizeSessionM } from '../authorization/authorize'
import { ApiM, storeSessionAndReturnBody } from './api/apim'
import { getMissedFound } from './helpers'
import * as RQ from './requests'
import * as AR from './requests/reader'
import * as T from './requests/types/types'

export type Env = {
  retries: number
}

export type Api<A> = R.Reader<Env, AR.DriveApiRequest<A>>

export const of = <A>(v: A): Api<A> => () => SRTE.of(v)

const onInvalidSession = <S extends AR.State>(): AR.ApiSessionRequest<void, S> => {
  return pipe(
    authorizeSessionM<S>(),
    AR.map(constVoid),
  )
}

const catchFetchErrors = (triesLeft: number) =>
  <T, S extends AR.State>(
    m: () => AR.ApiSessionRequest<T, S>,
  ): AR.ApiSessionRequest<T, S> => {
    return pipe(
      m(),
      AR.orElse((e) => {
        return FetchError.is(e) && triesLeft > 0
          ? catchFetchErrors(triesLeft - 1)(m)
          : SRTE.left(e)
      }),
    )
  }

const catchInvalidSession = <T, S extends AR.State>(
  m: () => AR.ApiSessionRequest<T, S>,
): AR.ApiSessionRequest<T, S> => {
  return pipe(
    m(),
    AR.orElse((e) => {
      return InvalidGlobalSessionResponse.is(e)
        ? pipe(
          onInvalidSession<S>(),
          AR.chain(m),
        )
        : SRTE.left(e)
    }),
  )
}

const executeRequest = <TArgs extends unknown[], R, S extends AR.State>(
  f: (...args: TArgs) => AR.ApiSessionRequest<R, S>,
): (...args: TArgs) => R.Reader<Env, AR.ApiSessionRequest<R, S>> =>
  (...args: TArgs) =>
    R.asks(({ retries }) =>
      pipe(
        catchInvalidSession(
          () => catchFetchErrors(retries)(() => f(...args)),
        ),
      )
    )

export const renameItemsM = flow(
  executeRequest(RQ.renameItemsM),
)

export const putBackItemsFromTrash = flow(
  executeRequest(RQ.putBackItemsFromTrashM),
)

export const retrieveTrashDetails = flow(
  executeRequest(RQ.retrieveTrashDetailsM),
)

export const retrieveItemDetailsInFolders = flow(
  executeRequest(RQ.retrieveItemDetailsInFoldersM),
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
  R.map(AR.map(_ => _.data_token.url)),
)

export const createFolders = flow(
  executeRequest(RQ.createFoldersM),
)

export const moveItems = flow(
  executeRequest(RQ.moveItemsM),
)

export const moveItemsToTrash = flow(
  executeRequest(RQ.moveItemsToTrashM),
)
