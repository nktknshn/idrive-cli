import assert from 'assert'
import { pipe } from 'fp-ts/lib/function'
import * as O from 'fp-ts/Option'
import * as R from 'fp-ts/Record'
import * as TE from 'fp-ts/TaskEither'
import { C, DriveLookup } from '../../icloud-drive'
import * as L from '../../util/logging'
import { file, folder } from './helpers-drive'
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
            structure0.r.c.folder1.c.folder2.d.drivewsid,
          ),
        ),
        cache: pipe(
          C.cachef(),
          C.putDetailss([
            structure0.r.d,
            structure0.r.c.folder1.d,
            structure0.r.c.folder1.c.folder2.d,
            structure0.r.c.folder1.c.folder3.d,
            structure0.r.c.folder1.c.folder4.d,
          ]),
        ),
      })(
        DriveLookup.retrieveItemDetailsInFoldersSaving([
          structure0.r.c.folder1.c.folder2.d.drivewsid,
          structure0.r.c.folder1.c.folder3.d.drivewsid,
        ]),
      ),
      TE.map(({ calls, res, state }) => {
        expect(res).toMatchObject([
          O.none,
          O.some({
            drivewsid: structure0.r.c.folder1.c.folder3.d.drivewsid,
          }),
        ])

        expect(
          state.cache.byDrivewsid[structure0.r.c.folder1.c.folder2.d.drivewsid],
        ).toBeUndefined()

        expect(
          state.cache.byDrivewsid[structure0.r.c.folder1.c.folder4.d.drivewsid],
        ).toBeDefined()
      }),
    )

    assert((await req0())._tag === 'Right')
  })
})
