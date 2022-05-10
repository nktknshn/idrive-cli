import { pipe } from 'fp-ts/lib/function'
import * as SRTE from 'fp-ts/lib/StateReaderTaskEither'
import * as TE from 'fp-ts/TaskEither'
import { DriveLookup } from '../../../icloud-drive'
import { usingTempCache } from '../../../icloud-drive/drive-lookup'
import * as C from '../../../icloud-drive/drive-lookup/cache'
import * as L from '../../../util/logging'
import { npath } from '../../../util/normalize-path'
import { file, folder } from '../helpers-drive'
import { executeDrive, fakeicloud } from '../struct'

L.initLoggers(
  { debug: true },
  [
    L.logger,
    L.cacheLogger,
    L.stderrLogger,
    L.apiLogger,
  ],
)

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

describe('getFoldersTrees', () => {
  it('with temp cache', async () => {
    return pipe(
      DriveLookup.getByPathsFoldersStrictDocwsroot([
        npath('/test1/test2/test3'),
        npath('/test1/test2'),
        npath('/test1/'),
      ]),
      SRTE.chain(dirs => DriveLookup.getFoldersTrees(dirs, Infinity)),
      DriveLookup.usingTempCache,
      executeDrive({
        itemByDrivewsid: struct0.itemByDrivewsid,
        cache: pipe(
          C.cachef(),
          C.putDetailss([
            struct0.r.d,
          ]),
        ),
      }),
      TE.map(({ calls }) => {
        expect(calls().total).toBe(7)
      }),
      TE.mapLeft(() => {
        expect(false).toBe(true)
      }),
    )()
  })

  it('getFolderTreeByPathFlattenWP', async () => {
    return pipe(
      DriveLookup.getFoldersTreesByPathsDocwsroot(
        [
          npath('/test1/test2'),
          npath('/test1/test2/test3'),
        ],
      ),
      executeDrive({
        itemByDrivewsid: struct0.itemByDrivewsid,
        cache: pipe(
          C.cachef(),
          C.putDetailss([
            struct0.r.d,
            struct0.r.c.test1.d,
            struct0.r.c.test1.c.test2.d,
          ]),
        ),
      }),
      TE.map(res => {
        expect(res.calls().total).toBe(5)
      }),
      TE.mapLeft(() => {
        expect(false).toBe(true)
      }),
    )()
  })
})
