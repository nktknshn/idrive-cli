import * as A from 'fp-ts/lib/Array'
import { pipe } from 'fp-ts/lib/function'
import * as NA from 'fp-ts/lib/NonEmptyArray'
import * as SRTE from 'fp-ts/lib/StateReaderTaskEither'
import { NormalizedPath } from '../../../util/normalize-path'
import { NEA } from '../../../util/types'
import { DriveLookup, DriveTree } from '../..'
import * as T from '../../drive-types'

export const searchInPaths = (
  paths: NEA<NormalizedPath>,
  query: (item: DriveTree.WithItemPathValue<T.DetailsDocwsRoot>) => boolean,
  depth = Infinity,
): DriveLookup.Lookup<
  NA.NonEmptyArray<DriveTree.WithItemPathValue<T.DetailsDocwsRoot>[]>
> => {
  return pipe(
    DriveLookup.getFoldersTreesByPathsFlattenDocwsroot(paths, depth),
    SRTE.map(NA.map(A.filter(query))),
  )
}
