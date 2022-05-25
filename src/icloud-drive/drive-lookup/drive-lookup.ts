import * as SRTE from 'fp-ts/lib/StateReaderTaskEither'
import * as O from 'fp-ts/Option'
import { AuthorizedState } from '../../icloud-core/icloud-request'
import { err } from '../../util/errors'
import { DriveApi } from '..'
import * as C from './cache'
export * from './methods/cache-methods'
export { getFoldersTrees } from './methods/drive-get-folders-trees'
export {
  getFoldersTreesByPathsDocwsroot,
  getFoldersTreesByPathsFlattenDocwsroot,
  getFolderTreeByPathDocwsroot,
  getFolderTreeByPathFlattenWPDocwsroot,
} from './methods/drive-get-folders-trees-ext'
export { searchInPaths } from './methods/drive-search'
export * from './methods/drive-search-globs'
export * from './methods/get-by-paths'

export type Deps = DriveApi.Dep<'retrieveItemDetailsInFolders'>

export type TempCacheState = {
  tempCache: O.Option<C.Cache>
}

export type State =
  & { cache: C.Cache }
  & TempCacheState
  & AuthorizedState

export type Effect<A, R = Deps> = SRTE.StateReaderTaskEither<State, R, Error, A>
export type Action<R, A> = SRTE.StateReaderTaskEither<State, R, Error, A>

export const { map, chain: chain_, filterOrElse } = SRTE

export const of: <S extends State, R, E = never, A = never>(a: A) => SRTE.StateReaderTaskEither<S, R, E, A> = SRTE.of

export const get = (): SRTE.StateReaderTaskEither<State, Deps, never, State> => SRTE.get<State, Deps>()

export const chainState = <A>(
  f: (s: State) => SRTE.StateReaderTaskEither<State, Deps, Error, A>,
): SRTE.StateReaderTaskEither<State, Deps, Error, A> => SRTE.chain(f)(get())

export const errS = <A>(s: string): Effect<A> => SRTE.left(err(s))

export const chain = chain_ as (<A, B>(f: (a: A) => Effect<B>) => (ma: Effect<A>) => Effect<B>)
