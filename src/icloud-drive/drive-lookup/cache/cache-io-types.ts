import * as t from 'io-ts'
import * as tt from '../../../util/io-date'
import * as io from '../../drive-types/types-io'

export const cacheEntityFolderRootDetails = t.type({
  type: t.readonly(t.literal('ROOT')),
  content: t.readonly(io.detailsRoot),
  created: tt.DateFromISOString,
})

export const cacheEntityFolderTrashDetails = t.type({
  type: t.readonly(t.literal('TRASH_ROOT')),
  content: t.readonly(io.detailsTrash),
  created: tt.DateFromISOString,
})

export const cacheEntityFolderDetails = t.type({
  type: t.readonly(t.literal('FOLDER')),
  content: t.readonly(io.detailsFolder),
  created: tt.DateFromISOString,
})

export const cacheEntityFolderItem = t.type({
  type: t.readonly(t.literal('FOLDER')),
  content: t.readonly(io.itemFolder),
  created: tt.DateFromISOString,
})

export const cacheEntityAppLibraryDetails = t.type({
  type: t.readonly(t.literal('APP_LIBRARY')),
  content: t.readonly(io.detailsAppLibrary),
  created: tt.DateFromISOString,
})

export const cacheEntityAppLibraryItem = t.type({
  type: t.readonly(t.literal('APP_LIBRARY')),
  content: t.readonly(io.itemAppLibrary),
  created: tt.DateFromISOString,
})

export const cacheEntityFile = t.type({
  type: t.readonly(t.literal('FILE')),
  content: t.readonly(io.itemFile),
  created: tt.DateFromISOString,
})

export const cacheEntity = t.union([
  cacheEntityFolderRootDetails,
  cacheEntityFolderTrashDetails,
  cacheEntityFolderDetails,
  cacheEntityAppLibraryDetails,
])

export const cache = t.type({
  byDrivewsid: t.record(t.string, cacheEntity),
})
