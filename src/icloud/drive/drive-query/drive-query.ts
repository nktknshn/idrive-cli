import * as SRTE from 'fp-ts/lib/StateReaderTaskEither'
import { err } from '../../../util/errors'
import { AuthorizedState } from '../../request'
import { DepApi, DepDriveApiEnv } from '../drive-api'
import * as C from './cache'

export * from './methods/cache-methods'
export { getFoldersTrees } from './methods/drive-get-folders-trees'
export * from './methods/drive-search-globs'
export * from './methods/get-by-paths'

export type Deps = DepApi<'retrieveItemDetailsInFolders'>

export type State = { cache: C.Cache } & AuthorizedState

export type Effect<A, R = Deps> = SRTE.StateReaderTaskEither<State, R, Error, A>
export type Action<R, A> = SRTE.StateReaderTaskEither<State, R, Error, A>

export const { map, chain, of, filterOrElse } = SRTE

export const state = () => SRTE.get<State, Deps>()

export const errS = <A>(s: string): Effect<A> => SRTE.left(err(s))
