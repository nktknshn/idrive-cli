import { pipe } from 'fp-ts/lib/function'
import * as TE from 'fp-ts/lib/TaskEither'
import { parseName } from '../../icloud/drive/helpers'
import { apiActionM } from '../api-action'
import { hierarchyToPath } from '../cli-drive/cli-drive-actions/helpers'

export const retrieveTrashDetails = (argv: {
  sessionFile: string
}) => {
  return apiActionM(
    ({ api }) => pipe(api.retrieveTrashDetails()),
  )({ sessionFile: argv.sessionFile })
}

export const putBackItemsFromTrash = (argv: {
  sessionFile: string
  drivewsid: string
  etag: string
}) => {
  return pipe(
    { sessionFile: argv.sessionFile },
    apiActionM(
      ({ api }) =>
        pipe(api.putBackItemsFromTrash([{
          drivewsid: argv.drivewsid,
          etag: argv.etag,
        }])),
    ),
  )
}

export const rename = (argv: {
  sessionFile: string
  raw: boolean
  debug: boolean
  drivewsid: string
  name: string
  etag: string
}) =>
  apiActionM(
    ({ api }) =>
      pipe(
        api.renameItems([
          { drivewsid: argv.drivewsid, ...parseName(argv.name), etag: argv.etag },
        ]),
      ),
  )({ sessionFile: argv.sessionFile })

export const retrieveItemDetailsInFolders = (argv: {
  sessionFile: string
  raw: boolean
  debug: boolean
  drivewsids: string[]
  h: boolean
}) =>
  apiActionM(
    ({ api }) =>
      pipe(
        (argv.h
          ? api.retrieveItemDetailsInFoldersHierarchies
          : api.retrieveItemDetailsInFolders)(argv.drivewsids),
      ),
  )({ sessionFile: argv.sessionFile })

export const retrieveItemDetails = (argv: {
  sessionFile: string
  raw: boolean
  debug: boolean
  drivewsids: string[]
}) =>
  apiActionM(
    ({ api }) =>
      pipe(
        api.retrieveItemsDetails(argv.drivewsids),
      ),
  )({ sessionFile: argv.sessionFile })

export const retrieveHierarchy = (argv: {
  sessionFile: string
  raw: boolean
  debug: boolean
  drivewsids: string[]
}) =>
  apiActionM(
    ({ api }) =>
      pipe(
        TE.Do,
        TE.bind('hierarchy', () => api.retrieveHierarchy(argv.drivewsids)),
        TE.bind('path', ({ hierarchy }) => TE.of(hierarchyToPath(hierarchy[0].hierarchy))),
      ),
  )({ sessionFile: argv.sessionFile })
