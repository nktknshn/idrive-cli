import * as E from 'fp-ts/Either'
import { flow, pipe } from 'fp-ts/lib/function'
import * as R from 'fp-ts/lib/Record'
import * as SRTE from 'fp-ts/lib/StateReaderTaskEither'
import * as NA from 'fp-ts/NonEmptyArray'
import * as O from 'fp-ts/Option'
import * as TE from 'fp-ts/TaskEither'
import { DepApi, Drive } from '../../src/icloud/drive'
import * as C from '../../src/icloud/drive/cache/cache'
import { DriveApiDeps } from '../../src/icloud/drive/deps/api-type'
import * as T from '../../src/icloud/drive/types'
import * as L from '../../src/util/logging'
import { authorizedState } from '../fixtures'
import { createRootDetails, docwsroot } from './helpers-drive'

export const fakeicloud = flow(docwsroot, createRootDetails)
// complexStructure0.aa.Obsidian.children.my1.children.misc.children.images
export const createState = ({
  cache = C.cachef(),
}) => ({ ...authorizedState, cache })
type Calls = {
  calls: () => {
    retrieveItemDetailsInFolders: number
    total: number
  }
}

const retrieveItemDetailsInFolders = (
  detailsRec: Record<string, T.DetailsOrFile<T.DetailsDocwsRoot>>,
): DriveApiDeps['retrieveItemDetailsInFolders'] =>
  ({ drivewsids }) => {
    return SRTE.of(pipe(
      drivewsids,
      NA.map(did => R.lookup(did)(detailsRec)),
      NA.map(O.foldW(
        () => T.invalidId,
        d => d.type === 'FILE' ? T.invalidId : d,
      )),
    ))
  }

export const createEnv = (
  details: Record<string, T.DetailsOrFile<T.DetailsDocwsRoot>>,
): Calls & DepApi<'retrieveItemDetailsInFolders'> => {
  const calls = {
    retrieveItemDetailsInFolders: 0,
    total: 0,
  }
  return {
    calls: () => calls,
    api: {
      retrieveItemDetailsInFolders: (args) => {
        calls.retrieveItemDetailsInFolders += 1
        calls.total += 1
        L.apiLogger.debug(`retrieveItemDetailsInFolders(${JSON.stringify(args)})`)

        return pipe(
          // SRTE.fromIO(() =>)),
          retrieveItemDetailsInFolders(details)(args),
        )
      },
    },
  }
}

export const executeDrive = ({
  itemByDrivewsid: details,
  cache = E.of(C.cachef()),
}: {
  itemByDrivewsid: Record<string, T.DetailsOrFile<T.DetailsDocwsRoot>>
  cache?: E.Either<Error, C.Cache>
}): <A>(m: Drive.Effect<A>) => TE.TaskEither<Error, { res: A; state: Drive.State } & Calls> => {
  return m =>
    pipe(
      TE.fromEither(cache),
      TE.chain(cache => {
        const state = createState({ cache })
        const env = createEnv(details)

        return pipe(
          m(state)(env),
          TE.map(([res, state]) => ({
            res,
            state,
            calls: env.calls,
          })),
        )
      }),
    )
}
