import assert from 'assert'
import * as A from 'fp-ts/lib/Array'
import { flow, pipe } from 'fp-ts/lib/function'
import * as NA from 'fp-ts/lib/NonEmptyArray'
import * as RA from 'fp-ts/lib/ReadonlyArray'
import * as SRTE from 'fp-ts/lib/StateReaderTaskEither'
import { NormalizedPath } from '../../../cli/cli-drive/cli-drive-actions/helpers'
import { err } from '../../../lib/errors'
import * as V from '../cache/GetByPathResultValid'
import * as DF from '../fdrive'
import { Details, DriveChildrenItemFile, fileName } from '../types'
import { lsss } from './lsss'

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
