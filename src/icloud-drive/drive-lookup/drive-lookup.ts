import { pipe } from 'fp-ts/lib/function'
import { IO } from 'fp-ts/lib/IO'
import * as SRTE from 'fp-ts/lib/StateReaderTaskEither'
import * as O from 'fp-ts/Option'
import { AuthenticatedState } from '../../icloud-core/icloud-request'
import { err } from '../../util/errors'
import { DepApiMethod } from '../drive-api'
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

export type Cache = C.LookupCache

export type ApiUsage =
  /** Default behaviour. Always validates cached paths by retrieving from API. */
  | 'always'
  /** Retrieves from cache only. */
  | 'onlycache'
  /** Retrieves from API if the path is not fully cached. */
  | 'fallback'

export type DepHooks = {
  hookPutCache?: Lookup<void>
  hookPesistState?: Lookup<void>
}

export type DepApiUsage = {
  apiUsage: ApiUsage
}

export type Deps =
  & DepApiMethod<'retrieveItemDetailsInFolders'>
  & DepHooks
  & DepApiUsage

export type TempLookupCacheState = {
  /** A second cache is used for temporary caching. The details in this cache are considered fresh and do not need to be verified. `retrieveItemDetailsInFoldersTempCached` utilizes this cache to avod repeated api calls. */
  tempCache: O.Option<C.LookupCache>
  /** Details to remove from the main cache when the temp cache is merged */
  tempCacheMissingDetails: string[]
}

/** Lookup state is lookup cache and authenticated state */
export type State =
  & { cache: C.LookupCache }
  & TempLookupCacheState
  & AuthenticatedState

export type Lookup<A, R = Deps> = SRTE.StateReaderTaskEither<State, R, Error, A>

export const { map, chain: chain_, filterOrElse } = SRTE

export const of: <S extends State, R, E = never, A = never>(a: A) => SRTE.StateReaderTaskEither<S, R, E, A> = SRTE.of

export const getState = (): SRTE.StateReaderTaskEither<State, Deps, never, State> => SRTE.get<State, Deps>()

export const ask = (): SRTE.StateReaderTaskEither<State, Deps, never, Deps> => SRTE.ask<State, Deps>()

export const asks = <A>(f: (d: Deps) => A): SRTE.StateReaderTaskEither<State, Deps, never, A> =>
  SRTE.asks<State, Deps, A, never>(f)

export const left = <E, R extends Deps>(e: E): SRTE.StateReaderTaskEither<State, R, E, State> =>
  SRTE.left<State, Deps, E>(e)

export const chainState = <A>(
  f: (s: State) => SRTE.StateReaderTaskEither<State, Deps, Error, A>,
): SRTE.StateReaderTaskEither<State, Deps, Error, A> => SRTE.chain(f)(getState())

export const chainStateAndDeps = <A>(
  f: (a: { state: State; deps: Deps }) => SRTE.StateReaderTaskEither<State, Deps, Error, A>,
): SRTE.StateReaderTaskEither<State, Deps, Error, A> =>
  pipe(
    SRTE.get<State, Deps>(),
    SRTE.bindTo('state'),
    SRTE.bind('deps', () => SRTE.ask()),
    SRTE.chain(f),
  )

export const errString = <A>(s: string): Lookup<A> => SRTE.left(err(s))

export const chain = chain_ as (<A, B>(f: (a: A) => Lookup<B>) => (ma: Lookup<A>) => Lookup<B>)

export const fromIO = <A>(io: IO<A>): Lookup<A> => SRTE.fromIO(io)
