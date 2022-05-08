import * as A from 'fp-ts/lib/Array'
import * as E from 'fp-ts/lib/Either'
import { flow, pipe } from 'fp-ts/lib/function'
import * as NA from 'fp-ts/lib/NonEmptyArray'
import { snd } from 'fp-ts/lib/ReadonlyTuple'
import * as SRTE from 'fp-ts/lib/StateReaderTaskEither'
import * as O from 'fp-ts/Option'
import micromatch from 'micromatch'
import { guardSnd } from '../../../util/guards'
import { NormalizedPath, normalizePath } from '../../../util/normalize-path'
import { Path } from '../../../util/path'
import { NEA } from '../../../util/types'
import { DriveLookup } from '../..'
import * as T from '../../icloud-drive-items-types'
import { flattenFolderTreeWithBasepath, FlattenTreeItemP, shallowFolder } from '../../util/drive-folder-tree'
import { modifySubset } from '../../util/drive-modify-subset'
import { getFoldersTrees } from './drive-get-folders-trees'

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
