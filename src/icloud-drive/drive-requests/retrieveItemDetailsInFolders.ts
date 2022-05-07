import * as A from 'fp-ts/lib/Array'
import * as E from 'fp-ts/lib/Either'
import { flow, pipe } from 'fp-ts/lib/function'
import * as RA from 'fp-ts/lib/ReadonlyArray'
import * as TE from 'fp-ts/lib/TaskEither'
import * as t from 'io-ts'
import * as iot from 'io-ts-types'
import { AuthorizedState } from '../../icloud-core/icloud-request/lib/request'
import * as AR from '../../icloud-core/icloud-request/lib/request'
import { ResponseHandler, ResponseWithSession } from '../../icloud-core/icloud-request/lib/request'
import { buildRequest } from '../../icloud-core/session/session-http'
import { FetchClientEither, HttpRequest } from '../../util/http/fetch-client'
import { apiLogger } from '../../util/logging'
import { NEA } from '../../util/types'
import { Details, DriveDetailsWithHierarchy, InvalidId, MaybeInvalidId } from './icloud-drive-items-types'
import { driveDetails, driveDetailsWithHierarchyPartial, invalidIdItem } from './icloud-drive-items-types/types-io'

export function retrieveItemDetailsInFoldersGeneric<R>(
  client: FetchClientEither,
  { accountData, session }: AuthorizedState,
  data: { drivewsid: string; partialData: boolean; includeHierarchy: boolean }[],
  handleResponse: ResponseHandler<R>,
): TE.TaskEither<Error, ResponseWithSession<R>> {
  apiLogger.debug(`retrieveItemDetailsInFolders: ${data.map(_ => _.drivewsid)}`)

  return pipe(
    session,
    buildRequest(
      'POST',
      `${accountData.webservices.drivews.url}/retrieveItemDetailsInFolders?dsid=${accountData.dsInfo.dsid}`,
      { addClientInfo: true, data },
    ),
    client,
    handleResponse(session),
  )
}

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

// eslint-disable-next-line id-length
export const getRetrieveItemDetailsInFoldersHttpRequest = <S extends AuthorizedState>(
  data: { drivewsid: string; partialData: boolean; includeHierarchy: boolean }[],
): AR.ApiRequest<HttpRequest, S, AR.RequestEnv> => {
  return pipe(
    AR.buildRequestC<S>(({ state: { accountData } }) => ({
      method: 'POST',
      url: `${accountData.webservices.drivews.url}/retrieveItemDetailsInFolders?dsid=${accountData.dsInfo.dsid}`,
      options: { addClientInfo: true, data },
    })),
  )
}

export function retrieveItemDetailsInFolders<S extends AuthorizedState>(
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
  )
}
