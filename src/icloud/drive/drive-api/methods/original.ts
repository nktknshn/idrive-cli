import { DepDriveApiEnv, useApi } from '../deps'

// FIXME
// export function retrieveItemDetailsInFoldersSaving<R extends T.Root>(
//   drivewsids: [R['drivewsid'], ...T.NonRootDrivewsid[]],
// ): Effect<[O.Some<R>, ...O.Option<T.NonRootDetails>[]]>
// export function retrieveItemDetailsInFoldersSaving(
//   drivewsids: [typeof rootDrivewsid, ...string[]],
// ): Effect<[O.Some<T.DetailsDocwsRoot>, ...O.Option<T.Details>[]]>
// export function retrieveItemDetailsInFoldersSaving(
//   drivewsids: [typeof trashDrivewsid, ...string[]],
// ): Effect<[O.Some<T.DetailsTrashRoot>, ...O.Option<T.Details>[]]>
// export function retrieveItemDetailsInFoldersSaving<R extends T.Root>(
//   drivewsids: [R['drivewsid'], ...string[]],
// ): Effect<[O.Some<R>, ...O.Option<T.Details>[]]>
// export function retrieveItemDetailsInFoldersSaving(
//   drivewsids: NEA<string>,
// ): Effect<NEA<O.Option<T.Details>>>
// export function retrieveItemDetailsInFoldersSaving(
//   drivewsids: NEA<string>,
// ): Effect<NEA<O.Option<T.Details>>> {
//   return pipe(
//     API.retrieveItemDetailsInFolders<State>({ drivewsids }),
//     chain((details) =>
//       pipe(
//         createMissedFound(drivewsids, details),
//         putMissedFound,
//         chain(() => of(NA.map(T.invalidIdToOption)(details))),
//       )
//     ),
//   )
// }
/** basic icloud api requests as standalone depended functions*/

export const renameItems = useApi((_: DepDriveApiEnv<'renameItems'>) => _.api.renameItems)

export const putBackItemsFromTrash = useApi((_: DepDriveApiEnv<'putBackItemsFromTrash'>) => _.api.putBackItemsFromTrash)

export const moveItems = useApi((_: DepDriveApiEnv<'moveItems'>) => _.api.moveItems)

export const moveItemsToTrash = useApi((_: DepDriveApiEnv<'moveItemsToTrash'>) => _.api.moveItemsToTrash)

export const retrieveItemDetailsInFolders = useApi((_: DepDriveApiEnv<'retrieveItemDetailsInFolders'>) =>
  _.api.retrieveItemDetailsInFolders
)

export const download = useApi((_: DepDriveApiEnv<'download'>) => _.api.download)

export const downloadBatch = useApi((_: DepDriveApiEnv<'downloadBatch'>) => _.api.downloadBatch)

export const createFolders = useApi((_: DepDriveApiEnv<'createFolders'>) => _.api.createFolders)
