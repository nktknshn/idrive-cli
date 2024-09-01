import * as A from 'fp-ts/lib/Array'
import * as E from 'fp-ts/lib/Either'
import { flow, pipe } from 'fp-ts/lib/function'
import * as RA from 'fp-ts/lib/ReadonlyArray'
import * as t from 'io-ts'
import * as AR from '../../icloud-core/icloud-request'
import { AuthenticatedState } from '../../icloud-core/icloud-request'
import { debugTimeSRTE } from '../../logging/debug-time'
import { apiLoggerIO } from '../../logging/loggerIO'
import { HttpRequest } from '../../util/http/fetch-client'
import * as iot from '../../util/io-nonEmptyArrays'
import { runLogging } from '../../util/srte-utils'
import { NEA } from '../../util/types'
import { Details, DriveDetailsWithHierarchy, InvalidId, MaybeInvalidId } from '../drive-types'
import { driveDetails, driveDetailsWithHierarchyPartial, invalidIdItem } from '../drive-types/types-io'

export const decodeWithHierarchy: t.Decode<unknown, MaybeInvalidId<DriveDetailsWithHierarchy>[]> = flow(
  t.array(t.UnknownRecord).decode,
  E.chain(flow(
    A.chunksOf(2),
    A.map(
      t.tuple([
        t.union([driveDetails, invalidIdItem]),
        t.union([driveDetailsWithHierarchyPartial, invalidIdItem]),
      ]).decode,
    ),
    E.sequenceArray,
  )),
  E.map(flow(
    RA.map(([a, b]) =>
      (invalidIdItem.is(a) || invalidIdItem.is(b))
        ? { status: 'ID_INVALID' as const }
        : ({ ...a, hierarchy: b.hierarchy })
    ),
    RA.toArray,
  )),
)

export const getRetrieveItemDetailsInFoldersHttpRequest = <S extends AuthenticatedState>(
  data: { drivewsid: string; partialData: boolean; includeHierarchy: boolean }[],
): AR.ApiRequest<HttpRequest, S, AR.RequestDeps> => {
  return pipe(
    AR.buildRequest<S>(({ state: { accountData } }) => ({
      method: 'POST',
      url: `${accountData.webservices.drivews.url}/retrieveItemDetailsInFolders?dsid=${accountData.dsInfo.dsid}`,
      options: { addClientInfo: true, data },
    })),
  )
}

export function retrieveItemDetailsInFolders<S extends AuthenticatedState>(
  { drivewsids }: { drivewsids: string[] },
): AR.ApiRequest<NEA<(Details | InvalidId)>, S> {
  return pipe(
    getRetrieveItemDetailsInFoldersHttpRequest<S>(
      drivewsids.map(
        (drivewsid) => ({ drivewsid, partialData: false, includeHierarchy: false }),
      ),
    ),
    AR.handleResponse(AR.basicJsonResponse(
      iot.nonEmptyArray(t.union([driveDetails, invalidIdItem])).decode,
    )),
    runLogging(apiLoggerIO.debug('retrieveItemDetailsInFolders')),
    debugTimeSRTE('retrieveItemDetailsInFolders'),
  )
}
