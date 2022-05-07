import assert from 'assert'
import { pipe } from 'fp-ts/lib/function'
import * as SRTE from 'fp-ts/lib/StateReaderTaskEither'
import * as NA from 'fp-ts/NonEmptyArray'
import * as TE from 'fp-ts/TaskEither'
import { C, DriveQuery } from '../../src/icloud/drive'
import { NotFoundError } from '../../src/icloud/drive/drive-query/errors'
import { showFolderTree } from '../../src/icloud/drive/util/folder-tree'
import { invalidPath, validPath } from '../../src/icloud/drive/util/get-by-path-types'
import * as L from '../../src/util/logging'
import { normalizePath, npath } from '../../src/util/normalize-path'
import { complexStructure0 } from './fixtures'
import { appLibrary, file, folder } from './helpers-drive'
import { createEnv, createState, executeDrive, fakeicloud } from './struct'

import { Stats } from 'fs'
import * as DA from '../../src/icloud/drive/drive-action/actions'
import * as DC from '../../src/icloud/drive/drive-action/actions/download/download-conflict'
import {
  recursiveDirMapper,
  shallowDirMapper,
} from '../../src/icloud/drive/drive-action/actions/download/download-helpers'

L.initLoggers(
  { debug: true },
  [
    L.logger,
    L.cacheLogger,
    L.stderrLogger,
    L.apiLogger,
  ],
)

describe('retrieveItemDetailsInFoldersSaving', () => {
  it('works', async () => {
    const fstat = (path: string): TE.TaskEither<Error, Stats> => TE.of({})
    DC.lookForConflicts(
      { downloadable: [], empties: [], localdirstruct: [] },
    )({ fs: { fstat } })
  })
})
