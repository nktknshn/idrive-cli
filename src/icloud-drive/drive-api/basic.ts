import { apiMethod, PickDriveApiWrappedMethod } from './method'

/** Basic icloud api requests as standalone depended functions*/

export const renameItems = apiMethod((_: PickDriveApiWrappedMethod<'renameItems'>) => _.api.renameItems)

export const putBackItemsFromTrash = apiMethod((_: PickDriveApiWrappedMethod<'putBackItemsFromTrash'>) =>
  _.api.putBackItemsFromTrash
)

export const moveItems = apiMethod((_: PickDriveApiWrappedMethod<'moveItems'>) => _.api.moveItems)

export const moveItemsToTrash = apiMethod((_: PickDriveApiWrappedMethod<'moveItemsToTrash'>) => _.api.moveItemsToTrash)

export const retrieveItemDetailsInFolders = apiMethod((_: PickDriveApiWrappedMethod<'retrieveItemDetailsInFolders'>) =>
  _.api.retrieveItemDetailsInFolders
)

export const download = apiMethod((_: PickDriveApiWrappedMethod<'download'>) => _.api.download)

export const downloadBatch = apiMethod((_: PickDriveApiWrappedMethod<'downloadBatch'>) => _.api.downloadBatch)

export const createFolders = apiMethod((_: PickDriveApiWrappedMethod<'createFolders'>) => _.api.createFolders)
