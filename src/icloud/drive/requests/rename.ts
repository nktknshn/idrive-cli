import * as t from 'io-ts'
import { AuthorizedState } from '../../request/request'
import * as AR from '../../request/request'
import { childrenItem } from '../drive-types/types-io'

const renameResponse = t.type({ items: t.array(childrenItem) })

// eslint-disable-next-line @typescript-eslint/no-empty-interface
export interface RenameResponse extends t.TypeOf<typeof renameResponse> {}

export const renameItems = <S extends AuthorizedState>(
  { items }: {
    items: { drivewsid: string; etag: string; name: string; extension?: string }[]
  },
): AR.AuthorizedRequest<RenameResponse, S> =>
  AR.basicDriveJsonRequest(
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
