import * as A from 'fp-ts/lib/Array'
import { flow, pipe } from 'fp-ts/lib/function'
import * as NA from 'fp-ts/lib/NonEmptyArray'
import * as SRTE from 'fp-ts/lib/StateReaderTaskEither'
import { NormalizedPath } from '../../../util/normalize-path'
import { NEA } from '../../../util/types'
import { DriveLookup } from '../..'
import * as T from '../../icloud-drive-items-types'
import { FlattenTreeItemP } from '../../util/drive-folder-tree'

export type SearchInPathFoundItem = {
  path: string
  item: T.DetailsOrFile<T.DetailsDocwsRoot>
}

export const searchInPaths = (
  paths: NEA<NormalizedPath>,
  query: (item: FlattenTreeItemP<T.DetailsDocwsRoot>) => boolean,
  depth = Infinity,
): DriveLookup.Effect<
  NA.NonEmptyArray<SearchInPathFoundItem[]>
> => {
  return pipe(
    DriveLookup.getFoldersTreesByPathFlattenWPDocwsroot(paths, depth),
    SRTE.map(NA.map(flow(
      A.filter(query),
      A.map(([path, item]) => ({ path, item })),
    ))),
  )
}
