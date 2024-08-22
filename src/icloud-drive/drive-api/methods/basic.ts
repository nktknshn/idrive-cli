import { apiMethod, DepApi } from '../deps'

/** Basic icloud api requests as standalone depended functions*/

export const renameItems = apiMethod((_: DepApi<'renameItems'>) => _.api.renameItems)

export const putBackItemsFromTrash = apiMethod((_: DepApi<'putBackItemsFromTrash'>) => _.api.putBackItemsFromTrash)

export const moveItems = apiMethod((_: DepApi<'moveItems'>) => _.api.moveItems)

export const moveItemsToTrash = apiMethod((_: DepApi<'moveItemsToTrash'>) => _.api.moveItemsToTrash)

export const retrieveItemDetailsInFolders = apiMethod((_: DepApi<'retrieveItemDetailsInFolders'>) =>
  _.api.retrieveItemDetailsInFolders
)

export const download = apiMethod((_: DepApi<'download'>) => _.api.download)

export const downloadBatch = apiMethod((_: DepApi<'downloadBatch'>) => _.api.downloadBatch)

export const createFolders = apiMethod((_: DepApi<'createFolders'>) => _.api.createFolders)
