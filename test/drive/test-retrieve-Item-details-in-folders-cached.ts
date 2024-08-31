import { pipe } from 'fp-ts/lib/function'
import * as O from 'fp-ts/Option'
import * as R from 'fp-ts/Record'
import * as TE from 'fp-ts/TaskEither'
import { Cache, DriveLookup } from '../../src/icloud-drive'
import './debug'
import { enableDebug } from './debug'
import { executeDrive, fakeicloud, file, folder } from './util/mocked-drive'

enableDebug(false)

describe('retrieveItemDetailsInFoldersCached', () => {
  it('removes missing items from the main cache', async () => {
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

    return pipe(
      executeDrive({
        itemByDrivewsid: pipe(
          structure0.itemByDrivewsid,
          R.deleteAt(
            structure0.r.c.folder1.c.folder2.d.drivewsid,
          ),
        ),
        cache: pipe(
          Cache.cachef(),
          Cache.putDetailss([
            structure0.r.d,
            structure0.r.c.folder1.d,
            structure0.r.c.folder1.c.folder2.d,
            structure0.r.c.folder1.c.folder3.d,
            structure0.r.c.folder1.c.folder4.d,
          ]),
        ),
      })(
        DriveLookup.retrieveItemDetailsInFoldersCached([
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
      TE.mapLeft((e) => {
        expect(false).toBe(true)
      }),
    )
  })
})
