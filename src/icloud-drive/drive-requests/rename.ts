import { flow } from 'fp-ts/lib/function'
import * as t from 'io-ts'
import { AuthenticatedState } from '../../icloud-core/icloud-request'
import * as AR from '../../icloud-core/icloud-request'
import { debugTimeSRTE } from '../../logging/debug-time'
import { apiLoggerIO } from '../../logging/loggerIO'
import { runLogging } from '../../util/srte-utils'
import { childrenItem } from '../drive-types/types-io'

const renameResponse = t.type({ items: t.array(childrenItem) })

// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export interface RenameResponse extends t.TypeOf<typeof renameResponse> {}

export const renameItems = <S extends AuthenticatedState>(
  { items }: {
    items: { drivewsid: string; etag: string; name: string; extension?: string }[]
  },
): AR.ApiRequest<RenameResponse, S> =>
  flow(
    runLogging(apiLoggerIO.debug('renameItems')),
    debugTimeSRTE('renameItems'),
  )(
    AR.basicJsonRequest(
      ({ state: { accountData } }) => ({
        method: 'POST',
        url: `${accountData.webservices.drivews.url}/renameItems?dsid=${accountData.dsInfo.dsid}`,
        options: {
          addClientInfo: true,
          data: { items },
        },
      }),
      renameResponse.decode,
    ),
  )
