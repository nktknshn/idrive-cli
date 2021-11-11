import * as A from 'fp-ts/lib/Array'
import * as E from 'fp-ts/lib/Either'
import { apply, flow, pipe } from 'fp-ts/lib/function'
import * as RA from 'fp-ts/lib/ReadonlyArray'
import * as TE from 'fp-ts/lib/TaskEither'
import * as t from 'io-ts'
import { FetchClientEither } from '../../../lib/fetch-client'
import {
  applyCookies,
  basicGetResponse1,
  createHttpResponseReducer1,
  expectJson,
  ResponseHandler,
  ResponseWithSession,
} from '../../../lib/response-reducer'
import { ICloudSessionValidated } from '../../authorization/authorize'
import { ICloudSession } from '../../session/session'
import { buildRequest } from '../../session/session-http'
import {
  DriveDetails,
  DriveDetailsFolder,
  DriveDetailsPartialWithHierarchy,
  DriveDetailsWithHierarchy,
  InvalidId,
} from '../types'
import {
  detailsWithHierarchy,
  driveDetails,
  driveDetailsWithHierarchyPartial,
  invalidIdItem,
  itemDetails,
} from '../types-io'
import { applyToSession, decodeJson, filterStatus, withResponse } from './filterStatus'

interface RetrieveOpts {
  drivewsids: string[]
  partialData: boolean
  includeHierarchy: boolean
}

function retrieveItemDetailsInFoldersGeneric<R>(
  client: FetchClientEither,
  { accountData, session }: ICloudSessionValidated,
  data: {
    drivewsid: string
    partialData: boolean
    includeHierarchy: boolean
  }[],
  handleResponse: ResponseHandler<R>,
): TE.TaskEither<Error, ResponseWithSession<R>> {
  return pipe(
    session,
    buildRequest(
      'POST',
      `${accountData.webservices.drivews.url}/retrieveItemDetailsInFolders?dsid=${accountData.dsInfo.dsid}&appIdentifier=iclouddrive&reqIdentifier=9d4788f6-fc48-47e1-8d38-13c46d8d85db&clientBuildNumber=2116Project37&clientMasteringNumber=2116B28&clientId=f4058d20-0430-4cd5-bb85-7eb9b47fc94e`,
      { data },
    ),
    client,
    handleResponse(session),
  )
}

const decode: t.Decode<unknown, (DriveDetailsWithHierarchy | InvalidId)[]> = flow(
  t.array(
    t.UnknownRecord,
  ).decode,
  E.chain(flow(
    A.chunksOf(2),
    A.map(
      t.tuple([
        t.union([driveDetails, invalidIdItem]),
        t.union([driveDetailsWithHierarchyPartial, invalidIdItem]),
      ])
        .decode,
    ),
    E.sequenceArray,
  )),
  E.map(flow(
    RA.map(([a, b]) =>
      (invalidIdItem.is(a) || invalidIdItem.is(b))
        ? { status: 'INVALID_ID' as const }
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
      TE.chain(
        flow(
          withResponse,
          filterStatus(),
          decodeJson(
            decode,
            // t.array(
            //   t.UnknownRecord,
            //   // t.union([driveDetails, invalidIdItem]),
            // ).decode,
          ),
          applyToSession(({ httpResponse }) => applyCookies(httpResponse)(session)),
        ),
      ),
    // pipe(
    //   createHttpResponseReducer1(
    //     flow(
    //       basicGetResponse1(
    //         (json: unknown): json is DriveDetailsWithHierarchy[] => Array.isArray(json),
    //       ),
    //       E.map(
    //         flow(
    //           A.chunksOf(2),
    //           A.map(([a, b]) => ({ ...a, hierarchy: b.hierarchy })),
    //         ),
    //       ),
    //     ),
    //   ),
    // ),
  )
}

const handleResponse: ResponseHandler<DriveDetails[]> = (session: ICloudSession) =>
  TE.chain(
    flow(
      withResponse,
      filterStatus(),
      decodeJson(
        t.array(
          driveDetails,
          // t.union([driveDetails, invalidIdItem]),
        ).decode,
      ),
      applyToSession(({ httpResponse }) => applyCookies(httpResponse)(session)),
    ),
  )
// expectJson((
//   json: unknown,
// ): json is DriveDetails[] => Array.isArray(json))

export function retrieveItemDetailsInFolders(
  client: FetchClientEither,
  { accountData, session }: ICloudSessionValidated,
  props: RetrieveOpts,
): TE.TaskEither<Error, ResponseWithSession<DriveDetails[]>> {
  return retrieveItemDetailsInFoldersGeneric(
    client,
    { accountData, session },
    props.drivewsids.map((drivewsid) => ({
      drivewsid,
      partialData: props.partialData,
      includeHierarchy: props.includeHierarchy,
    })),
    handleResponse,
  )
}

const applyHttpResponseToSessionHierarchy = expectJson((
  json: unknown,
): json is DriveDetailsPartialWithHierarchy[] => Array.isArray(json))

export function retrieveHierarchy(
  client: FetchClientEither,
  { accountData, session }: ICloudSessionValidated,
  { drivewsids }: { drivewsids: string[] },
): TE.TaskEither<Error, ResponseWithSession<DriveDetailsPartialWithHierarchy[]>> {
  return retrieveItemDetailsInFoldersGeneric(
    client,
    { accountData, session },
    drivewsids.map((drivewsid) => ({
      drivewsid,
      partialData: true,
      includeHierarchy: true,
    })),
    applyHttpResponseToSessionHierarchy,
  )
}
