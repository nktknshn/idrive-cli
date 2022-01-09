import { hole, pipe } from 'fp-ts/lib/function'
import * as TE from 'fp-ts/lib/TaskEither'
import * as AM from '../../icloud/drive/api'
import { parseName } from '../../icloud/drive/helpers'
import * as RQ from '../../icloud/drive/requests'
import { apiActionM } from '../api-action'
import { hierarchyToPath } from '../cli-drive/cli-drive-actions/helpers'

export const retrieveTrashDetails = (argv: {
  sessionFile: string
}) => {
  return apiActionM(
    () => pipe(RQ.retrieveTrashDetailsM()),
  )({ sessionFile: argv.sessionFile })
}

export const putBackItemsFromTrash = (argv: {
  drivewsid: string
  etag: string
}) => {
  return apiActionM(
    () =>
      RQ.putBackItemsFromTrashM([{
        drivewsid: argv.drivewsid,
        etag: argv.etag,
      }]),
  )
}

export const rename = (argv: {
  drivewsid: string
  name: string
  etag: string
}) =>
  apiActionM(
    () =>
      pipe(
        RQ.renameItemsM({
          items: [
            { drivewsid: argv.drivewsid, ...parseName(argv.name), etag: argv.etag },
          ],
        }),
      ),
  )

export const retrieveItemDetailsInFolders = (argv: {
  drivewsids: string[]
  h: boolean
}) =>
  apiActionM(
    () =>
      pipe(
        hole(),
        // (argv.h
        //   ? api.retrieveItemDetailsInFoldersHierarchies
        //   : api.retrieveItemDetailsInFolders)(argv.drivewsids),
      ),
  )

export const retrieveItemDetails = (argv: {
  drivewsids: string[]
}) =>
  apiActionM(
    () =>
      pipe(
        hole(),
        // api.retrieveItemsDetails(argv.drivewsids),
      ),
  )

export const retrieveHierarchy = (argv: {
  drivewsids: string[]
}) =>
  apiActionM(
    () =>
      pipe(
        hole(),
        // TE.Do,
        // TE.bind('hierarchy', () => api.retrieveHierarchy(argv.drivewsids)),
        // TE.bind('path', ({ hierarchy }) => TE.of(hierarchyToPath(hierarchy[0].hierarchy))),
      ),
  )
