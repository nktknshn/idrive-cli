import assert from 'assert'
import { pipe } from 'fp-ts/lib/function'
import * as TE from 'fp-ts/TaskEither'
import { C, DriveLookup } from '../../src/icloud-drive'
import { NotFoundError } from '../../src/icloud-drive/drive-lookup/errors'
import { rootDrivewsid } from '../../src/icloud-drive/icloud-drive-items-types/types-io'
import { invalidPath, pathTarget } from '../../src/icloud-drive/util/get-by-path-types'
import { npath } from '../../src/util/normalize-path'
import './debug'
import { appLibrary, executeDrive, fakeicloud, file, folder, removeByDrivewsid } from './util/mocked-drive'

describe('getByPaths', () => {
  const structure = fakeicloud(
    appLibrary({
      name: 'Obsidian',
      docwsid: 'documents',
      zone: 'iCloud.md.obsidian',
    })(
      folder({ name: 'my1' })(
        file({ name: 'note1.md' }),
        file({ name: 'note2.md' }),
        folder({ name: 'bookmarks' })(
          file({ name: 'index.md' }),
        ),
        folder({ name: 'misc' })(
          folder({ name: 'images' })(
            folder({ name: 'backup' })(
              file({ name: '_image1.png' }),
              file({ name: '_image2.png' }),
            ),
            file({ name: 'image1.png' }),
            file({ name: 'image2.png' }),
            file({ name: 'image3.png' }),
          ),
        ),
      ),
    ),
    folder({ name: 'folder1' })(
      folder({ name: 'subfolder1' })(
        folder({ name: 'sources' })(
          file({ name: 'package.json' }),
          file({ name: 'index.ts' }),
          file({ name: 'tsconfig.json' }),
        ),
      ),
      file({ name: 'file1.txt' }),
      file({ name: 'file2.txt' }),
    ),
  )

  it('works fully cached', async () => {
    return pipe(
      DriveLookup.getByPathsDocwsroot([
        npath('/Obsidian/my1/misc/images/'),
      ]),
      executeDrive({
        itemByDrivewsid: structure.itemByDrivewsid,
        cache: pipe(
          C.cachef(),
          C.putDetailss(
            structure.allFolders,
            // [
            //   structure.root.details,
            //   structure.root.byName.Obsidian.details,
            //   structure.root.byName.Obsidian.byName.my1.details,
            // ],
          ),
        ),
      }),
      TE.map(({ calls, res, state }) => {
        assert(res[0].valid === true)

        expect(
          pathTarget(res[0]),
        ).toStrictEqual(
          structure.r.c.Obsidian.c.my1.c.misc.c.images.d,
        )

        // expect(
        //   Object.keys(state.cache.byDrivewsid).length,
        // ).toBe(2)
      }),
      TE.mapLeft((e) => {
        expect(false).toBe(true)
      }),
    )
  })

  it('works fully cached multiple dirs', async () => {
    return pipe(
      DriveLookup.getByPathsDocwsroot([
        npath('/Obsidian/my1/misc/images/'),
        npath('/folder1/subfolder1/sources/tsconfig.json'),
      ]),
      executeDrive({
        itemByDrivewsid: structure.itemByDrivewsid,
        cache: pipe(
          C.cachef(),
          C.putDetailss(
            structure.allFolders,
            // [
            //   structure.root.details,
            //   structure.root.byName.Obsidian.details,
            //   structure.root.byName.Obsidian.byName.my1.details,
            // ],
          ),
        ),
      }),
      TE.map(({ calls, res, state }) => {
        // L.logger.debug(
        //   showGetByPathResult(structure.r.c.Obsidian.c.my1.c.misc.c.images.validPath),
        // )

        expect(res).toMatchObject(
          [
            structure.r.c.Obsidian.c.my1.c.misc.c.images.validPath,
            // validPath([]),
          ],
        )

        // expect(
        //   Object.keys(state.cache.byDrivewsid).length,
        // ).toBe(2)
      }),
      TE.mapLeft((e) => {
        expect(false).toBe(true)
      }),
    )
  })

  it('works', async () => {
    const itemByDrivewsid = pipe(
      structure.itemByDrivewsid,
      removeByDrivewsid(
        structure.r.c.Obsidian.c.my1.d.drivewsid,
      ),
    )
    return pipe(
      DriveLookup.getByPathsDocwsroot([
        npath('/Obsidian/my1/misc/images/'),
      ]),
      executeDrive({
        itemByDrivewsid,
        cache: pipe(
          C.cachef(),
          C.putDetailss(structure.allFolders),
        ),
      }),
      TE.map(({ calls, res, state }) => {
        expect(res).toMatchObject(
          [
            invalidPath(
              [
                expect.objectContaining({ drivewsid: rootDrivewsid }),
                expect.objectContaining({
                  drivewsid: structure.r.c.Obsidian.d.drivewsid,
                }),
              ],
              ['my1', 'misc', 'images'],
              expect.any(NotFoundError),
            ),
          ],
        )

        expect(
          calls().retrieveItemDetailsInFolders,
        ).toBe(1)
      }),
      TE.mapLeft((e) => {
        expect(false).toBe(true)
      }),
    )
  })
})
