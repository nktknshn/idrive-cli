import * as t from 'io-ts'
import { AuthorizedState } from '../../icloud-core/icloud-request/lib/request'
import * as AR from '../../icloud-core/icloud-request/lib/request'
import { childrenItem } from '../drive-types/types-io'

const renameResponse = t.type({ items: t.array(childrenItem) })

// eslint-disable-next-line @typescript-eslint/no-empty-interface
export interface RenameResponse extends t.TypeOf<typeof renameResponse> {}

export const renameItems = <S extends AuthorizedState>(
  { items }: {
    items: { drivewsid: string; etag: string; name: string; extension?: string }[]
  },
): AR.ApiRequest<RenameResponse, S> =>
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
  )
