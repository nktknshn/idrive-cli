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

export type TempLookupCacheState = {
  tempCache: O.Option<C.LookupCache>
}

/** Lookup state is lookup cache and authorized state */
export type LookupState =
  & { cache: C.LookupCache }
  & TempLookupCacheState
  & AuthorizedState

export type Effect<A, R = Deps> = SRTE.StateReaderTaskEither<LookupState, R, Error, A>
export type Action<R, A> = SRTE.StateReaderTaskEither<LookupState, R, Error, A>

export const { map, chain: chain_, filterOrElse } = SRTE

export const of: <S extends LookupState, R, E = never, A = never>(a: A) => SRTE.StateReaderTaskEither<S, R, E, A> =
  SRTE.of

export const get = (): SRTE.StateReaderTaskEither<LookupState, Deps, never, LookupState> =>
  SRTE.get<LookupState, Deps>()
export const left = <E, R extends Deps>(e: E): SRTE.StateReaderTaskEither<LookupState, R, E, LookupState> =>
  SRTE.left<LookupState, Deps, E>(e)

export const chainState = <A>(
  f: (s: LookupState) => SRTE.StateReaderTaskEither<LookupState, Deps, Error, A>,
): SRTE.StateReaderTaskEither<LookupState, Deps, Error, A> => SRTE.chain(f)(get())

export const errString = <A>(s: string): Effect<A> => SRTE.left(err(s))

export const chain = chain_ as (<A, B>(f: (a: A) => Effect<B>) => (ma: Effect<A>) => Effect<B>)
