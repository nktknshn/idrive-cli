import { sequenceS } from 'fp-ts/lib/Apply'
import { flow, identity, pipe } from 'fp-ts/lib/function'
import * as SRTE from 'fp-ts/lib/StateReaderTaskEither'
import * as R from 'fp-ts/Reader'
import { FetchClientEither } from '../../../lib/http/fetch-client'
import { XX, XXX } from '../../../lib/types'
import { AuthorizedState, AuthorizeEnv, authorizeSession as authorizeSession_ } from '../../authorization/authorize'
import { AccountData } from '../../authorization/types'
import * as RQ from '../../drive/drive-requests'
import { BasicState, RequestEnv } from '../../drive/drive-requests/request'
import { CatchFetchEnv, catchFetchErrorsSRTE, CatchSessEnv, catchSessErrorsSRTE } from './catch'
import { ApiDepsType } from './type'

const seqS = sequenceS(R.Apply)

type Enh<R2> = <Args extends unknown[], A, R>(
  req: <S extends AuthorizedState>(...args: Args) => XXX<S, R, A>,
) => R.Reader<
  R2 & R,
  <S extends AuthorizedState>(...args: Args) => XX<S, A>
>
/** use this dependency to modify schema */
export type SchemaMapperEnv = { schemaMapper?: (s: typeof apiDepsScheme) => typeof apiDepsScheme }

/** env attached to api deps  */
export type ApiDepsEnv = CatchFetchEnv & CatchSessEnv & RequestEnv & AuthorizeEnv

/** add this to dependency when you want to create a request with a different env*/
export type SchemaEnv = { schema: typeof apiDepsScheme; depsEnv: ApiDepsEnv }

const attachDeps = <Args extends unknown[], A, R>(
  req: <S extends AuthorizedState>(...args: Args) => XXX<S, R, A>,
): R.Reader<R, <S extends AuthorizedState>(...args: Args) => XX<S, A>> =>
  (deps: R) => {
    return <S extends AuthorizedState>(...args: Args) =>
      pipe(
        req<S>(...args),
        SRTE.local(() => deps),
      )
  }

const addErrorHandlers = <Args extends unknown[], A, R>(
  req: <S extends AuthorizedState>(...args: Args) => XXX<S, R, A>,
): R.Reader<CatchFetchEnv & AuthorizeEnv & CatchSessEnv, typeof req> =>
  (deps) => {
    return <S extends AuthorizedState>(...args: Args) =>
      pipe(
        req<S>(...args),
        catchFetchErrorsSRTE(deps),
        catchSessErrorsSRTE(deps),
      )
  }

// : Enh<CatchFetchEnv & RequestEnv & AuthorizeEnv & CatchSessEnv>
const prepareRequest = flow(
  addErrorHandlers,
  R.chainW(attachDeps),
)

// const prepareRequest2: Enh<RetryEnv & RequestEnv & AuthorizeEnv & { a: 1 }> = flow(
//   addErrorHandlers,
//   R.chainW(attachDeps),
// )

export const authorizeSession: R.Reader<
  AuthorizeEnv & CatchFetchEnv,
  ApiDepsType['authorizeSession']
> = (deps) =>
  <S extends BasicState>(): XX<S, AccountData> => {
    return pipe(
      authorizeSession_<S>(),
      SRTE.local(() => deps),
      catchFetchErrorsSRTE(deps),
    )
  }

const apiDepsScheme = {
  // base icloud api requests with fulfield dependencies and attached error handlers
  retrieveItemDetailsInFolders: pipe(
    RQ.retrieveItemDetailsInFolders,
    prepareRequest,
    // R.local((a) => ({ ...a, catchSessErrors: false })),
  ),
  createFolders: prepareRequest(RQ.createFolders),
  downloadBatch: prepareRequest(RQ.downloadBatch),
  download: prepareRequest(RQ.download),
  renameItems: prepareRequest(RQ.renameItems),
  putBackItemsFromTrash: prepareRequest(RQ.putBackItemsFromTrash),
  moveItems: prepareRequest(RQ.moveItems),
  moveItemsToTrash: prepareRequest(RQ.moveItemsToTrash),
  upload: prepareRequest(RQ.upload),
  singleFileUpload: prepareRequest(RQ.singleFileUpload),
  updateDocuments: prepareRequest(RQ.updateDocuments),
  // authorization
  authorizeSession,
  // utility
  fetchClient: pipe(R.ask<{ fetch: FetchClientEither }>(), R.map(_ => _.fetch)),
} as const

export const createApiDeps: R.Reader<
  ApiDepsEnv & SchemaMapperEnv,
  ApiDepsType & SchemaEnv
> = pipe(
  R.asksReaderW(({ schemaMapper }: SchemaMapperEnv) =>
    pipe(
      R.of((schemaMapper ?? identity)(apiDepsScheme)),
      R.bindTo('schema'),
      R.bind('deps', ({ schema }) => seqS(schema)),
      R.bind('depsEnv', () => R.ask<ApiDepsEnv>()),
      R.map(_ => ({ ..._.deps, schema: _.schema, depsEnv: _.depsEnv })),
    )
  ),
)
