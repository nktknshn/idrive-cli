import * as E from 'fp-ts/Either'
import { flow, pipe } from 'fp-ts/lib/function'
import * as R from 'fp-ts/lib/Record'
import * as SRTE from 'fp-ts/lib/StateReaderTaskEither'
import * as NA from 'fp-ts/NonEmptyArray'
import * as O from 'fp-ts/Option'
import * as TE from 'fp-ts/TaskEither'
import { DriveLookup, Types } from '../../../../src/icloud-drive'
import { DepApiMethod } from '../../../../src/icloud-drive/drive-api'
import { DriveApiWrapped } from '../../../../src/icloud-drive/drive-api-wrapped'
import { ApiUsage, DepApiUsage } from '../../../../src/icloud-drive/drive-lookup'
import * as C from '../../../../src/icloud-drive/drive-lookup/cache'
import { CreateFoldersResponse } from '../../../../src/icloud-drive/drive-requests'
import * as L from '../../../../src/logging'
import { authenticatedState } from '../../fixtures/session'
import { createRootDetails, docwsroot, folder, makeFolder } from './mocked-drive'

export const fakeicloud = flow(docwsroot, createRootDetails)

export const createState = ({
  cache = C.cache(),
  tempCache = O.none,
  tempCacheMissingDetails = [],
}: {
  cache?: C.LookupCache
  tempCache?: O.Option<never>
  tempCacheMissingDetails?: string[]
}): DriveLookup.State => ({ ...authenticatedState, cache, tempCache, tempCacheMissingDetails })

export type Calls = {
  calls: () => {
    retrieveItemDetailsInFolders: number
    createFolders: number
    total: number
    retrieveItemDetailsInFoldersIds: string[][]
  }
}

type CallsObj = ReturnType<Calls['calls']>

const retrieveItemDetailsInFolders = (
  detailsRec: Record<string, Types.DetailsOrFile<Types.DetailsDocwsRoot>>,
): DriveApiWrapped['retrieveItemDetailsInFolders'] =>
  ({ drivewsids }) => {
    return SRTE.of(pipe(
      drivewsids,
      NA.map(did => R.lookup(did)(detailsRec)),
      NA.map(O.foldW(
        () => Types.invalidId,
        d => d.type === 'FILE' ? Types.invalidId : d,
      )),
    ))
  }

export type Deps =
  & DriveLookup.Deps
  & DepApiMethod<'createFolders'>
  & DepApiUsage

export const createDeps = (
  details: Record<string, Types.DetailsOrFile<Types.DetailsDocwsRoot>>,
  apiUsage: ApiUsage = 'always',
):
  & Calls
  & Deps =>
{
  const calls = {
    retrieveItemDetailsInFolders: 0,
    createFolders: 0,
    total: 0,
    retrieveItemDetailsInFoldersIds: [] as string[][],
  }

  return {
    calls: () => calls,
    apiUsage,
    api: {
      retrieveItemDetailsInFolders: (args) => {
        calls.retrieveItemDetailsInFolders += 1
        calls.total += 1
        calls.retrieveItemDetailsInFoldersIds.push(args.drivewsids)

        L.apiLogger.debug(`retrieveItemDetailsInFolders(${JSON.stringify(args)})`)

        return pipe(
          retrieveItemDetailsInFolders(details)(args),
        )
      },
      createFolders: ({ destinationDrivewsId, names }) => {
        calls.createFolders += 1
        calls.total += 1
        L.apiLogger.debug(`createFolders(${JSON.stringify({ destinationDrivewsId, names })})`)

        const ds = details[destinationDrivewsId]

        if (ds.type == 'FOLDER' || ds.type == 'APP_LIBRARY') {
          const f = folder({ name: names[0] })()
          const ff = makeFolder({ parentId: ds.drivewsid, zone: ds.zone })(f)

          ds.items.push(ff.d)

          details[ff.d.drivewsid] = ff.d

          const resp: CreateFoldersResponse = {
            destinationDrivewsId: destinationDrivewsId,
            folders: [ff.d],
          }

          return SRTE.of(resp)
        }

        return SRTE.left(new Error('Invalid destinationDrivewsId'))
      },
    },
  }
}

export type ExecuteResult<A> = { res: A; state: DriveLookup.State } & Calls
export type ExecuteError = { error: Error; calls: Calls['calls'] }

export const executeDriveS = (itemByDrivewsid: Record<string, Types.DetailsOrFile<Types.DetailsDocwsRoot>>) =>
  (p: { cache?: C.LookupCache; apiUsage?: ApiUsage }) =>
    executeDrive({ itemByDrivewsid, cache: p.cache, apiUsage: p.apiUsage })

export const executeDrive = ({
  itemByDrivewsid: details,
  cache = C.cache(),
  apiUsage,
}: {
  itemByDrivewsid: Record<string, Types.DetailsOrFile<Types.DetailsDocwsRoot>>
  cache?: C.LookupCache
  apiUsage?: ApiUsage
}): <A>(
  m: DriveLookup.Lookup<A, Deps>,
) => TE.TaskEither<
  ExecuteError,
  ExecuteResult<A>
> => {
  return m => {
    const state = createState({ cache, tempCache: O.none })
    const deps = createDeps(details, apiUsage)

    return pipe(
      m(state)(deps),
      TE.map(([res, state]) => ({ res, state, calls: deps.calls })),
      TE.mapError(e => ({ error: e, calls: deps.calls })),
    )
  }
}
