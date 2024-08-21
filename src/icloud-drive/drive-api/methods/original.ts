import { GetDep, useApi } from '../deps'

/** basic icloud api requests as standalone depended functions*/

export const renameItems = useApi((_: GetDep<'renameItems'>) => _.api.renameItems)

export const putBackItemsFromTrash = useApi((_: GetDep<'putBackItemsFromTrash'>) => _.api.putBackItemsFromTrash)

export const moveItems = useApi((_: GetDep<'moveItems'>) => _.api.moveItems)

export const moveItemsToTrash = useApi((_: GetDep<'moveItemsToTrash'>) => _.api.moveItemsToTrash)

export const retrieveItemDetailsInFolders = useApi((_: GetDep<'retrieveItemDetailsInFolders'>) =>
  _.api.retrieveItemDetailsInFolders
)

export const download = useApi((_: GetDep<'download'>) => _.api.download)

export const downloadBatch = useApi((_: GetDep<'downloadBatch'>) => _.api.downloadBatch)

export const createFolders = useApi((_: GetDep<'createFolders'>) => _.api.createFolders)
