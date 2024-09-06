import * as NA from 'fp-ts/lib/NonEmptyArray'

import { NEA } from '../../../util/types'
import { DriveLookup } from '../..'

/** List paths recursively. Globs are supported */
export const listRecursive = ({ globs, depth }: {
  globs: NA.NonEmptyArray<string>
  depth: number
  cached: boolean
}): DriveLookup.Lookup<NEA<DriveLookup.SearchGlobFoundItem[]>> => {
  // appends '**' to the paths that are not globs to make a recursive search
  // const scanned = getScanned(globs)
  // globs = pipe(scanned, NA.map(_ => _.input))

  return DriveLookup.searchGlobs(globs, depth, { goDeeper: true })
}
