import assert from 'assert'
import { flow, pipe } from 'fp-ts/lib/function'
import * as R from 'fp-ts/lib/Record'
import * as SRTE from 'fp-ts/lib/StateReaderTaskEither'
import * as NA from 'fp-ts/NonEmptyArray'
import * as O from 'fp-ts/Option'
import * as TE from 'fp-ts/TaskEither'
import { DepApi, Drive } from '../../src/icloud/drive'
import * as C from '../../src/icloud/drive/cache/cache'
import { invalidPath, pathTarget, validPath } from '../../src/icloud/drive/cache/cache-get-by-path-types'
import { DriveApiType } from '../../src/icloud/drive/deps/api-type'
import { showFolderTree } from '../../src/icloud/drive/drive-methods/drive-get-folders-trees'
import { NotFoundError } from '../../src/icloud/drive/errors'
import * as T from '../../src/icloud/drive/types'
import * as L from '../../src/util/logging'
import { normalizePath, npath } from '../../src/util/normalize-path'
import { authorizedState } from '../fixtures'
import { appLibrary, createRootDetails, docwsroot, file, folder } from './helpers-drive'
import { executeDrive, fakeicloud } from './struct'

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
    const structure0 = fakeicloud(
      folder({ name: 'folder1' })(
        folder({ name: 'folder2' })(
          file({ name: 'file2.txt' }),
        ),
        folder({ name: 'folder3' })(
          file({ name: 'file3.txt' }),
        ),
        folder({ name: 'folder4' })(
          file({ name: 'file4.txt' }),
        ),
      ),
    )

    const req0 = pipe(
      executeDrive({
        itemByDrivewsid: pipe(
          structure0.itemByDrivewsid,
          R.deleteAt(
            structure0.root.byName.folder1.byName.folder2.details.drivewsid,
          ),
        ),
        cache: pipe(
          C.cachef(),
          C.putDetailss([
            structure0.root.details,
            structure0.root.byName.folder1.details,
            structure0.root.byName.folder1.byName.folder2.details,
            structure0.root.byName.folder1.byName.folder3.details,
            structure0.root.byName.folder1.byName.folder4.details,
          ]),
        ),
      })(
        Drive.retrieveItemDetailsInFoldersSaving([
          structure0.root.byName.folder1.byName.folder2.details.drivewsid,
          structure0.root.byName.folder1.byName.folder3.details.drivewsid,
        ]),
      ),
      TE.map(({ calls, res, state }) => {
        expect(res).toMatchObject([
          O.none,
          O.some({
            drivewsid: structure0.root.byName.folder1.byName.folder3.details.drivewsid,
          }),
        ])

        expect(
          state.cache.byDrivewsid[structure0.root.byName.folder1.byName.folder2.details.drivewsid],
        ).toBeUndefined()

        expect(
          state.cache.byDrivewsid[structure0.root.byName.folder1.byName.folder4.details.drivewsid],
        ).toBeDefined()
      }),
    )

    assert((await req0())._tag === 'Right')
  })
})
