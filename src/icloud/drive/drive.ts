// // export * from './drive-query/drive-methods/cache-methods'
// // export { getFoldersTrees } from './drive-query/drive-methods/drive-get-folders-trees'
// // export * from './drive-query/drive-methods/drive-search-globs'
// // export * from './drive-query/drive-methods/get-by-paths'
// // export * from './path-lookup/path-lookup'
// // export * from './path-lookup/methods/drive-get-by-paths'
// import * as SRTE from 'fp-ts/lib/StateReaderTaskEither'
// import { err } from '../../util/errors'
// import { AuthorizedState } from '../request/request'
// import { DepDriveApi } from './drive-api/deps'
// import * as C from './drive-query/cache/cache'

// export type Deps = DepDriveApi<'retrieveItemDetailsInFolders'>

// export type State = { cache: C.Cache } & AuthorizedState

// export type Effect<A, R = Deps> = SRTE.StateReaderTaskEither<State, R, Error, A>
// export type Action<R, A> = SRTE.StateReaderTaskEither<State, R, Error, A>

// export const { map, chain, of, filterOrElse } = SRTE

// export const state = () => SRTE.get<State, Deps>()

// export const errS = <A>(s: string): Effect<A> => SRTE.left(err(s))
