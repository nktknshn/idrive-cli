import * as A from 'fp-ts/lib/Array'
import * as E from 'fp-ts/lib/Either'
import { flow, pipe } from 'fp-ts/lib/function'
import * as RA from 'fp-ts/lib/ReadonlyArray'
import * as TE from 'fp-ts/lib/TaskEither'
import * as t from 'io-ts'
import { FetchClientEither } from '../../../lib/http/fetch-client'
import { apiLogger } from '../../../lib/logging'
import { applyCookiesToSession, buildRequest } from '../../session/session-http'
import { ICloudSessionValidated } from './authorization/authorize'
import { applyToSession, decodeJson, filterStatus, ResponseHandler, ResponseWithSession, withResponse } from './http'
import { Details, DriveDetailsWithHierarchy, InvalidId, MaybeNotFound } from './types/types'
import { driveDetails, driveDetailsWithHierarchyPartial, invalidIdItem } from './types/types-io'

export function retrieveItemDetailsInFoldersGeneric<R>(
  client: FetchClientEither,
  { accountData, session }: ICloudSessionValidated,
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

export function retrieveItemDetailsInFolders(
  client: FetchClientEither,
  { accountData, session }: ICloudSessionValidated,
  { drivewsids }: { drivewsids: string[] },
): TE.TaskEither<Error, ResponseWithSession<(Details | InvalidId)[]>> {
  return retrieveItemDetailsInFoldersGeneric(
    client,
    { accountData, session },
    drivewsids.map(
      (drivewsid) => ({ drivewsid, partialData: false, includeHierarchy: false }),
    ),
    (session) =>
      TE.chain(
        flow(
          withResponse,
          filterStatus(),
          decodeJson(t.array(t.union([driveDetails, invalidIdItem])).decode),
          applyToSession(({ httpResponse }) => applyCookiesToSession(httpResponse)(session)),
        ),
      ),
  )
}

export const decodeWithHierarchy: t.Decode<unknown, MaybeNotFound<DriveDetailsWithHierarchy>[]> = flow(
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

export function retrieveItemDetailsInFoldersHierarchy(
  client: FetchClientEither,
  { accountData, session }: ICloudSessionValidated,
  props: { drivewsids: string[] },
): TE.TaskEither<Error, ResponseWithSession<(DriveDetailsWithHierarchy | InvalidId)[]>> {
  return retrieveItemDetailsInFoldersGeneric(
    client,
    { accountData, session },
    pipe(
      props.drivewsids.map((drivewsid) => [
        { drivewsid, partialData: false, includeHierarchy: false },
        { drivewsid, partialData: true, includeHierarchy: true },
      ]),
      A.flatten,
    ),
    session =>
      TE.chain(flow(
        withResponse,
        filterStatus(),
        decodeJson(decodeWithHierarchy),
        applyToSession(({ httpResponse }) => applyCookiesToSession(httpResponse)(session)),
      )),
  )
}
