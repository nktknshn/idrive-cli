import * as t from 'io-ts'
import * as AR from '../../icloud-core/icloud-request'
import { AuthenticatedState } from '../../icloud-core/icloud-request'
import { logAPI } from '../../icloud-core/icloud-request/log'
import { childrenItem } from '../drive-types/types-io'

const renameResponse = t.type({ items: t.array(childrenItem) })

// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export interface RenameResponse extends t.TypeOf<typeof renameResponse> {}

export const renameItems = <S extends AuthenticatedState>(
  { items }: {
    items: { drivewsid: string; etag: string; name: string; extension?: string }[]
  },
): AR.ApiRequest<RenameResponse, S> =>
  logAPI('renameItems')(
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
