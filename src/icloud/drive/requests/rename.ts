import * as t from 'io-ts'
import { childrenItem } from '../types/types-io'
import { AuthorizedState } from './request'
import * as AR from './request'

const renameResponse = t.type({ items: t.array(childrenItem) })

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
