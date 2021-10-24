export type WasFolderChanged = {
  etag: boolean
  parentId: boolean
  details: boolean
  wasRenamed: boolean
  wasReplaced: boolean
  newItems: never[]
  removedItems: never[]
}
