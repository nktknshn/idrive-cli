import assert from 'assert'
import * as A from 'fp-ts/lib/Array'
import { flow, pipe } from 'fp-ts/lib/function'
import * as NA from 'fp-ts/lib/NonEmptyArray'
import * as RA from 'fp-ts/lib/ReadonlyArray'
import * as SRTE from 'fp-ts/lib/StateReaderTaskEither'
import { NormalizedPath } from '../../../cli/cli-drive/cli-drive-actions/helpers'
import { err } from '../../../lib/errors'
import * as DF from '../fdrive'
import { Details, DetailsRegular, DriveChildrenItemFile, fileName, Root } from '../requests/types/types'
import * as V from './GetByPathResultValid'
import { lsss } from './lsss'

export type DetailsOrFile<R> = (R | DetailsRegular | DriveChildrenItemFile)

export const lss = <R extends Root>(root: R, paths: NormalizedPath[]): DF.DriveM<DetailsOrFile<R>[]> => {
  assert(A.isNonEmpty(paths))

  return pipe(
    lsss(root, paths),
    DF.chain(
      flow(
        NA.map(res =>
          res.valid
            ? DF.of(V.target(res))
            : DF.left<DetailsOrFile<R>>(
              err(`error: ${res.error}. validPart=${res.path.details.map(fileName)} rest=[${res.path.rest}]`),
            )
        ),
        SRTE.sequenceArray,
        SRTE.map(RA.toArray),
      ),
    ),
  )
}
