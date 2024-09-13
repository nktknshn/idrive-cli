import { pipe } from 'fp-ts/lib/function'
import * as SRTE from 'fp-ts/lib/StateReaderTaskEither'
import { DriveLookup } from '../../../icloud-drive'
import { normalizePath } from '../../../util/normalize-path'

import * as Actions from '../../../icloud-drive/drive-actions'

export const move = ({ srcpath, dstpath }: {
  srcpath: string
  dstpath: string
}): DriveLookup.Lookup<string, Actions.DepsMove> => {
  const nsrc = normalizePath(srcpath)
  const ndst = normalizePath(dstpath)

  return pipe(
    Actions.move({ srcpath: nsrc, dstpath: ndst }),
    SRTE.map((res) => {
      if(res.items[0].status === 'OK') {
        return `Moved.\n`
      }

      return `Failed to move: ${res.items[0].status}\n`
    }),
  )
}
