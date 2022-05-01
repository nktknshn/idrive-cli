import assert from 'assert'
import { pipe } from 'fp-ts/lib/function'
import * as O from 'fp-ts/Option'
import * as R from 'fp-ts/Record'
import * as TE from 'fp-ts/TaskEither'
import { C, DriveQuery } from '../../src/icloud/drive'
import { NotFoundError } from '../../src/icloud/drive/drive-query/errors'
import { rootDrivewsid } from '../../src/icloud/drive/icloud-drive-types/types-io'
import { invalidPath, pathTarget } from '../../src/icloud/drive/util/get-by-path-types'
import * as L from '../../src/util/logging'
import { npath } from '../../src/util/normalize-path'
import { appLibrary, file, folder, removeByDrivewsid } from './helpers-drive'
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
        DriveQuery.retrieveItemDetailsInFoldersSaving([
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
