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
import { ApiType } from '../../src/icloud/drive/deps/api-type'
import { showFolderTree } from '../../src/icloud/drive/drive-methods/drive-get-folders-trees'
import { NotFoundError } from '../../src/icloud/drive/errors'
import * as T from '../../src/icloud/drive/types'
import * as L from '../../src/util/logging'
import { normalizePath, npath } from '../../src/util/normalize-path'
import { authorizedState } from '../fixtures'
import { complexStructure0 } from './fixtures'
import { appLibrary, createRootDetails, docwsroot, file, folder, removeByDrivewsid } from './helpers-drive'
import { executeDrive, struct } from './struct'

L.initLoggers(
  { debug: true },
  [
    L.logger,
    L.cacheLogger,
    L.stderrLogger,
    L.apiLogger,
  ],
)

describe('getByPaths', () => {
  it('works', async () => {
    const structure = struct(
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
    )

    const req0 = pipe(
      Drive.getByPathsDocwsroot([
        npath('/Obsidian/my1/misc/images/'),
      ]),
      executeDrive({
        itemByDrivewsid: removeByDrivewsid(
          structure.root.byName.Obsidian.byName.my1.details.drivewsid,
        )(
          structure.itemByDrivewsid,
        ),
        cache: pipe(
          C.cachef(),
          C.putDetailss(
            // structure.allFolders
            [
              structure.root.details,
              structure.root.byName.Obsidian.details,
              structure.root.byName.Obsidian.byName.my1.details,
            ],
          ),
        ),
      }),
      TE.map(({ calls, res, state }) => {
        assert(res[0].valid === true)

        expect(
          pathTarget(res[0]),
        ).toStrictEqual(
          structure.root.byName.Obsidian.byName.my1.byName.misc.byName.images.details,
        )

        // expect(
        //   Object.keys(state.cache.byDrivewsid).length,
        // ).toBe(2)

        expect(
          calls().retrieveItemDetailsInFolders,
        ).toBe(3)
      }),
    )

    console.log(
      await req0(),
    )

    // assert((await req0())._tag === 'Right')
  })
})
