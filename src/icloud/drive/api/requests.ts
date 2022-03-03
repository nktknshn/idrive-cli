import * as TE from 'fp-ts/TaskEither'
import { HttpResponse } from '../../../lib/http/fetch-client'
import { applyCookiesToSession, HttpRequestConfig } from '../../session/session-http'
import * as AR from './../requests/request'
import * as NM from './newbuilder'

import { pipe } from 'fp-ts/lib/function'
import * as t from 'io-ts'
import * as iot from 'io-ts-types'
import { BadRequestError, err, InvalidGlobalSessionError } from '../../../lib/errors'
import { DownloadResponseBody } from '../requests/download'
import { driveDetails, invalidIdItem } from '../requests/types/types-io'

const genericItemDetailsRequest = <S extends AR.AuthorizationState>(
  data: { drivewsid: string; partialData: boolean; includeHierarchy: boolean }[],
) =>
  ({ session, accountData }: S): TE.TaskEither<Error, HttpRequestConfig> =>
    TE.of({
      method: 'POST',
      url: `${accountData.webservices.drivews.url}/retrieveItemDetailsInFolders?dsid=${accountData.dsInfo.dsid}`,
      options: { addClientInfo: true, data },
    })

const defaultDecoding = (httpResponse: HttpResponse) =>
  pipe(
    TE.of({ httpResponse }),
    NM.checkStatuses([200]),
    NM.readJsonEither(),
  )

export const getFoldersRequest = <S extends AR.AuthorizationState>() =>
  NM.request(
    {
      constructor: ({ drivewsids }: { drivewsids: string[] }) =>
        genericItemDetailsRequest<S>(drivewsids.map(
          (drivewsid) => ({ drivewsid, partialData: false, includeHierarchy: false }),
        )),
      decodeResponse: (httpResponse: HttpResponse) =>
        pipe(
          defaultDecoding(httpResponse),
          NM.requireJson(
            v => iot.nonEmptyArray(t.union([driveDetails, invalidIdItem])).decode(v),
          ),
        ),
      handleResponse: ctx => NM.applyToSession<S>(applyCookiesToSession)(ctx),
      result: ctx => oldstate => state => TE.of(ctx.decoded),
    },
  )

export const downloadM = <S extends AR.AuthorizationState>() =>
  NM.request(
    {
      constructor: (
        { docwsid: documentId, zone }: { docwsid: string; zone: string },
      ) =>
        ({ session, accountData }: S) =>
          TE.of({
            method: 'GET',
            url:
              `${accountData.webservices.docws.url}/ws/${zone}/download/by_id?document_id=${documentId}&dsid=${accountData.dsInfo.dsid}`,
            options: { addClientInfo: false },
          }),
      decodeResponse: (httpResponse: HttpResponse) =>
        pipe(
          defaultDecoding(httpResponse),
          NM.requireJson(
            v => t.type({ data_token: t.type({ url: t.string }) }).decode(v) as t.Validation<DownloadResponseBody>,
          ),
        ),
      handleResponse: ctx => NM.applyToSession<S>(applyCookiesToSession)(ctx),
      result: ctx => oldstate => state => TE.of(ctx.decoded),
    },
  )
