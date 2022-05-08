import * as SRTE from 'fp-ts/lib/StateReaderTaskEither'
import { AuthorizedState } from '../../icloud-core/icloud-request'
import { err } from '../../util/errors'
import { DriveApi } from '..'
import * as C from './cache'

export * from './methods/cache-methods'
export { getFoldersTrees } from './methods/drive-get-folders-trees'
export {
  getFoldersTreesByPathFlattenWPDocwsroot,
  getFoldersTreesByPathsDocwsroot,
  getFolderTreeByPathDocwsroot,
  getFolderTreeByPathFlattenWPDocwsroot,
} from './methods/drive-get-folders-trees-ext'
export { searchInPaths } from './methods/drive-search'
export * from './methods/drive-search-globs'
export * from './methods/get-by-paths'

export type Deps = DriveApi.Dep<'retrieveItemDetailsInFolders'>

export type TempCacheState = {
  tempCache: C.Cache
  tempCacheActive: boolean
}

export type State =
  & { cache: C.Cache }
  & TempCacheState
  & AuthorizedState

export type Effect<A, R = Deps> = SRTE.StateReaderTaskEither<State, R, Error, A>
export type Action<R, A> = SRTE.StateReaderTaskEither<State, R, Error, A>

export const { map, chain, filterOrElse } = SRTE

export const of: <S extends State, R, E = never, A = never>(a: A) => SRTE.StateReaderTaskEither<S, R, E, A> = SRTE.of

export const state = () => SRTE.get<State, Deps>()

export const errS = <A>(s: string): Effect<A> => SRTE.left(err(s))
