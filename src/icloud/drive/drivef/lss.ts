import assert from 'assert'
import { identity } from 'fp-ts'
import * as A from 'fp-ts/lib/Array'
import * as E from 'fp-ts/lib/Either'
import { fromEquals } from 'fp-ts/lib/Eq'
import { constant, flow, hole, pipe } from 'fp-ts/lib/function'
import * as NA from 'fp-ts/lib/NonEmptyArray'
import * as O from 'fp-ts/lib/Option'
import * as RA from 'fp-ts/lib/ReadonlyArray'
import * as R from 'fp-ts/lib/Record'
import * as SRTE from 'fp-ts/lib/StateReaderTaskEither'
import { hierarchyToPath, itemWithHierarchyToPath, NormalizedPath } from '../../../cli/cli-drive-actions/helpers'
import { err } from '../../../lib/errors'
import { logf, logg, logger, logReturn, logReturnAs, logReturnS } from '../../../lib/logging'
import { cast, Path } from '../../../lib/util'
import { Cache } from '../cache/Cache'
import * as C from '../cache/cachef'
import * as V from '../cache/GetByPathResultValid'
import { CacheEntity, CacheEntityFolderLike } from '../cache/types'
import { ItemIsNotFolderError, NotFoundError } from '../errors'
import * as DF from '../fdrive'
import {
  Details,
  DetailsRoot,
  DriveChildrenItemAppLibrary,
  DriveChildrenItemFile,
  DriveChildrenItemFolder,
  DriveDetailsWithHierarchy,
  DriveFolderLike,
  fileName,
  Hierarchy,
  HierarchyItem,
  isDetails,
  isFolderDrivewsid,
  isFolderHierarchyEntry,
} from '../types'
import { HierarchyEntry } from '../types'
import { driveDetails } from '../types-io'
import { lookupCache } from './lookupCache'
import { log } from './ls'
import { lsss } from './lsss'
import { getValidHierarchyPart } from './validation'

export type DetailsOrFile = (Details | DriveChildrenItemFile)

export const lss = (paths: NormalizedPath[]): DF.DriveM<DetailsOrFile[]> => {
  // return getByPaths(paths)

  assert(A.isNonEmpty(paths))

  return pipe(
    lsss(paths),
    DF.chain(
      flow(
        NA.map(res =>
          res.valid
            ? DF.of(V.target(res))
            : DF.left<DetailsOrFile>(
              err(`error: ${res.error}. validPart=${res.path.details.map(fileName)} rest=[${res.path.rest}]`),
            )
        ),
        SRTE.sequenceArray,
        SRTE.map(RA.toArray),
      ),
    ),
  )
}
