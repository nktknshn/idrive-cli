import * as A from 'fp-ts/lib/Array'
import { flow, pipe } from 'fp-ts/lib/function'
import * as NA from 'fp-ts/lib/NonEmptyArray'
import * as SRTE from 'fp-ts/lib/StateReaderTaskEither'
import { NormalizedPath } from '../../../util/normalize-path'
import { NEA } from '../../../util/types'
import { DriveLookup } from '../..'
import * as T from '../../drive-types'
import { FlattenTreeItemP } from '../../util/drive-folder-tree'

export type SearchInPathFoundItem<R extends T.Root> = {
  remotepath: string
  remotefile: T.DetailsOrFile<R>
}

export const searchInPaths = (
  paths: NEA<NormalizedPath>,
  query: (item: FlattenTreeItemP<T.DetailsDocwsRoot>) => boolean,
  depth = Infinity,
): DriveLookup.Monad<
  NA.NonEmptyArray<SearchInPathFoundItem<T.DetailsDocwsRoot>[]>
> => {
  return pipe(
    DriveLookup.getFoldersTreesByPathsFlattenDocwsroot(paths, depth),
    SRTE.map(NA.map(A.filter(query))),
  )
}
