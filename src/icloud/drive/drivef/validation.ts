import * as A from 'fp-ts/lib/Array'
import { pipe } from 'fp-ts/lib/function'
import * as NA from 'fp-ts/lib/NonEmptyArray'
import * as O from 'fp-ts/lib/Option'
import { fileName, hasName } from '../helpers'
import { DriveDetails, isRootDetails } from '../types'

const same = (a: DriveDetails, b: DriveDetails) => {
  if (a.drivewsid !== b.drivewsid) {
    return false
  }

  if (!isRootDetails(a) && !isRootDetails(b)) {
    if (a.parentId !== b.parentId) {
      return false
    }
  }

  if (hasName(a) && hasName(b)) {
    return fileName(a) == fileName(b)
  }

  // if (
  //   !isHierarchyItemTrash(a) && !isHierarchyItemRoot(a)
  //   && !isHierarchyItemTrash(b) && !isHierarchyItemRoot(b)
  // ) {
  //   return fileName(a) == fileName(b)
  // }

  return true
}

export const getValidHierarchyPart = (
  actualDetails: NA.NonEmptyArray<O.Option<DriveDetails>>,
  cachedHierarchy: NA.NonEmptyArray<DriveDetails>,
): {
  validPart: DriveDetails[]
  rest: string[]
} => {
  const presentDetails = pipe(
    actualDetails,
    A.takeLeftWhile(O.isSome),
    A.map(_ => _.value),
  )

  return pipe(
    A.zip(presentDetails, cachedHierarchy),
    A.takeLeftWhile(([a, b]) => same(a, b)),
    _ => ({
      validPart: A.takeLeft(_.length)(presentDetails),
      rest: pipe(
        A.dropLeft(_.length)(cachedHierarchy),
        A.map(_ => hasName(_) ? fileName(_) : 'ERROR'),
      ),
    }),
  )
}
