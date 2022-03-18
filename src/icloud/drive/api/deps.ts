import { sequenceS, sequenceT } from 'fp-ts/lib/Apply'
import { constVoid, flow, identity, pipe } from 'fp-ts/lib/function'
import * as RTE from 'fp-ts/lib/ReaderTaskEither'
import * as SRTE from 'fp-ts/lib/StateReaderTaskEither'
import * as T from 'fp-ts/lib/Task'
import * as TE from 'fp-ts/lib/TaskEither'
import * as R from 'fp-ts/Reader'
import { InvalidGlobalSessionError } from '../../../lib/errors'
import { FetchClientEither, FetchError } from '../../../lib/http/fetch-client'
import { Getcode } from '../../../lib/input'
import { loggerIO } from '../../../lib/loggerIO'
import { XX, XXX } from '../../../lib/types'
import { AuthorizedState, AuthorizeEnv, authorizeSessionM as authorizeSessionM_ } from '../../authorization/authorize'
import { AccountLoginResponseBody } from '../../authorization/types'
import * as RQ from '../requests'
import { BasicState, RequestEnv } from '../requests/request'
import { ApiDepsType, Dep } from './type'

type CatchFetchEnv = { retries: number; catchFetchErrors: boolean; retryDelay: number }

const catchFetchErrorsTE = (triesLeft: number, retryDelay: number) =>
  <A>(
    m: TE.TaskEither<Error, A>,
  ): TE.TaskEither<Error, A> => {
    return pipe(
      m,
      TE.orElseFirst((e) =>
        FetchError.is(e)
          ? TE.fromIO(loggerIO.error(`try failed (${e}). retries left: ${triesLeft}`))
          : TE.of(constVoid())
      ),
      TE.orElse((e) =>
        triesLeft > 0 && FetchError.is(e)
          ? pipe(
            catchFetchErrorsTE(triesLeft - 1, retryDelay)(m),
            T.delay(retryDelay),
          )
          : TE.left(e)
      ),
    )
  }

export const catchFetchErrorsSRTE = ({ retries, retryDelay, catchFetchErrors }: CatchFetchEnv) =>
  <S, R, A>(
    m: SRTE.StateReaderTaskEither<S, R, Error, A>,
  ): SRTE.StateReaderTaskEither<S, R, Error, A> => {
    return (s: S) => (r: R) => pipe(m(s)(r), catchFetchErrors ? catchFetchErrorsTE(retries, retryDelay) : identity)
  }

// export const catchFetchErrorsSRTE2 = ({ retries }: { retries: number; delay: number }) =>
//   <S, R, A>(
//     m: SRTE.StateReaderTaskEither<S, R, Error, A>,
//   ): SRTE.StateReaderTaskEither<S, R, Error, A> => {
//     return (s: S) => (r: R) => pipe(m(s)(r), catchFetchErrorsTE(retries))
//   }

type CatchSessEnv = { catchSessErrors: boolean }

export const catchSessErrorsSRTE = (deps: CatchFetchEnv & AuthorizeEnv & CatchSessEnv) =>
  <S extends AuthorizedState, R, A>(
    m: SRTE.StateReaderTaskEither<S, R, Error, A>,
  ): SRTE.StateReaderTaskEither<S, R, Error, A> => {
    return ((s: S) =>
      // (r: R) =>
      pipe(
        m(s),
        RTE.orElse(e =>
          deps.catchSessErrors && InvalidGlobalSessionError.is(e)
            ? pipe(
              authorizeSession(deps)<S>()(s),
              RTE.chain(
                ([accountData, state]) => m({ ...state, accountData }),
              ),
            )
            : RTE.left(e)
        ),
      ))
  }

export const attachDeps = <Args extends unknown[], A, R>(
  req: <S extends AuthorizedState>(...args: Args) => XXX<S, R, A>,
): R.Reader<R, <S extends AuthorizedState>(...args: Args) => XX<S, A>> =>
  (deps: R) => {
    return <S extends AuthorizedState>(...args: Args) =>
      pipe(
        req<S>(...args),
        SRTE.local(() => deps),
      )
  }

export const addErrorHandlers = <Args extends unknown[], A, R>(
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

const seqS = sequenceS(R.Apply)

type Enh<R2> = <Args extends unknown[], A, R>(
  req: <S extends AuthorizedState>(...args: Args) => XXX<S, R, A>,
) => R.Reader<
  R2 & R,
  <S extends AuthorizedState>(...args: Args) => XX<S, A>
>
// : Enh<CatchFetchEnv & RequestEnv & AuthorizeEnv & CatchSessEnv>
const prepareRequest = flow(
  addErrorHandlers,
  R.chainW(attachDeps),
)

// const prepareRequest2: Enh<RetryEnv & RequestEnv & AuthorizeEnv & { a: 1 }> = flow(
//   addErrorHandlers,
//   R.chainW(attachDeps),
// )

const authorizeSession: R.Reader<
  AuthorizeEnv & CatchFetchEnv,
  ApiDepsType['authorizeSession']
> = (deps) =>
  <S extends BasicState>(): XX<S, AccountLoginResponseBody> => {
    return pipe(
      authorizeSessionM_<S>(),
      SRTE.local(() => deps),
      catchFetchErrorsSRTE(deps),
    )
  }

const apiDepsScheme = {
  // basic api requests with fulfield dependencies and attached error handlers
  retrieveItemDetailsInFolders: pipe(
    RQ.retrieveItemDetailsInFolders,
    prepareRequest,
    // R.local((a) => ({ ...a, catchSessErrors: false })),
  ),
  createFolders: prepareRequest(RQ.createFoldersM),
  downloadBatch: prepareRequest(RQ.downloadBatchM),
  download: prepareRequest(RQ.downloadM),
  renameItems: prepareRequest(RQ.renameItemsM),
  putBackItemsFromTrash: prepareRequest(RQ.putBackItemsFromTrashM),
  moveItems: prepareRequest(RQ.moveItemsM),
  moveItemsToTrash: prepareRequest(RQ.moveItemsToTrashM),
  upload: prepareRequest(RQ.uploadM),
  singleFileUpload: prepareRequest(RQ.singleFileUploadM),
  updateDocuments: prepareRequest(RQ.updateDocumentsM),
  // authorization
  authorizeSession,
  // utility
  fetchClient: pipe(R.ask<{ fetch: FetchClientEither }>(), R.map(_ => _.fetch)),
} as const

type SchemaMapperEnv = { schemaMapper?: (s: typeof apiDepsScheme) => typeof apiDepsScheme }

export type DepsEnv = CatchFetchEnv & CatchSessEnv & RequestEnv & AuthorizeEnv
export type SchemaEnv = { schema: typeof apiDepsScheme; depsEnv: DepsEnv }

export const createApiDeps: R.Reader<
  DepsEnv & SchemaMapperEnv,
  ApiDepsType & SchemaEnv
> = pipe(
  R.asksReaderW(({ schemaMapper }: SchemaMapperEnv) =>
    pipe(
      R.of(schemaMapper ? schemaMapper(apiDepsScheme) : apiDepsScheme),
      R.bindTo('schema'),
      R.bind('deps', ({ schema }) => seqS(schema)),
      R.bind('depsEnv', () => R.ask<DepsEnv>()),
      R.map(_ => ({ ..._.deps, schema: _.schema, depsEnv: _.depsEnv })),
    )
  ),
)
