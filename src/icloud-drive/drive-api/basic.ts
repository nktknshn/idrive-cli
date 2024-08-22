import { apiMethod, DepWrappedApi } from './method'

/** Basic icloud api requests as standalone depended functions*/

export const renameItems = apiMethod((_: DepWrappedApi<'renameItems'>) => _.api.renameItems)

export const putBackItemsFromTrash = apiMethod((_: DepWrappedApi<'putBackItemsFromTrash'>) =>
  _.api.putBackItemsFromTrash
)

export const moveItems = apiMethod((_: DepWrappedApi<'moveItems'>) => _.api.moveItems)

export const moveItemsToTrash = apiMethod((_: DepWrappedApi<'moveItemsToTrash'>) => _.api.moveItemsToTrash)

export const retrieveItemDetailsInFolders = apiMethod((_: DepWrappedApi<'retrieveItemDetailsInFolders'>) =>
  _.api.retrieveItemDetailsInFolders
)

export const download = apiMethod((_: DepWrappedApi<'download'>) => _.api.download)

export const downloadBatch = apiMethod((_: DepWrappedApi<'downloadBatch'>) => _.api.downloadBatch)

export const createFolders = apiMethod((_: DepWrappedApi<'createFolders'>) => _.api.createFolders)
