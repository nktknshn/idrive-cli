import assert from 'assert'
import { pipe } from 'fp-ts/lib/function'
import * as SRTE from 'fp-ts/lib/StateReaderTaskEither'
import * as NA from 'fp-ts/NonEmptyArray'
import * as TE from 'fp-ts/TaskEither'
import { DriveLookup } from '../../../icloud-drive'
import * as C from '../../../icloud-drive/drive-lookup/cache'
import { NotFoundError } from '../../../icloud-drive/drive-lookup/errors'
import { showFolderTree } from '../../../icloud-drive/util/drive-folder-tree'
import { invalidPath, validPath } from '../../../icloud-drive/util/get-by-path-types'
import * as L from '../../../util/logging'
import { normalizePath, npath } from '../../../util/normalize-path'
import { complexStructure0 } from '../fixtures'
import { appLibrary, file, folder } from '../helpers-drive'
import { createEnv, createState, executeDrive, fakeicloud } from '../struct'

L.initLoggers(
  { debug: true },
  [
    L.logger,
    L.cacheLogger,
    L.stderrLogger,
    L.apiLogger,
  ],
)

describe('getFoldersTrees', () => {
  it('getFolderTreeByPathFlattenWP', async () => {
    const struct0 = fakeicloud(
      file({ name: 'file1.txt' }),
      folder({ name: 'test1' })(
        file({ name: 'file2.txt' }),
        folder({ name: 'test2' })(
          file({ name: 'file2.txt' }),
          folder({ name: 'test3' })(
            file({ name: 'file2.txt' }),
            folder({ name: 'test4' })(
              file({ name: 'file2.txt' }),
              folder({ name: 'test5' })(
                file({ name: 'file2.txt' }),
                folder({ name: 'test6' })(
                  file({ name: 'file2.txt' }),
                ),
              ),
            ),
          ),
        ),
      ),
    )

    return pipe(
      DriveLookup.getFoldersTreesByPathsDocwsroot(
        [
          npath('/test1/'),
          npath('/test1/test2/test3'),
        ],
      ),
      executeDrive({
        itemByDrivewsid: struct0.itemByDrivewsid,
        // cache: pipe(
        //   C.cachef(),
        //   C.putDetailss(struct0.allFolders),
        // ),
      }),
      TE.map(res => {
        console.log(
          res,
        )
      }),
      TE.mapLeft(() => {
        expect(false).toBe(true)
      }),
    )()
  })
})
