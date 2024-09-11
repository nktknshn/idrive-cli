import assert from 'assert'
import { pipe } from 'fp-ts/lib/function'
import * as SRTE from 'fp-ts/lib/StateReaderTaskEither'
import * as TE from 'fp-ts/TaskEither'
import { DriveLookup } from '../../../src/icloud-drive'
import * as C from '../../../src/icloud-drive/drive-lookup/cache'
import { npath } from '../../../src/util/normalize-path'
import { enableDebug } from '../debug'
import * as M from '../util/mocked-drive'

enableDebug(false)

const struct0 = M.fakeicloud(
  M.file({ name: 'file1.txt' }),
  M.folder({ name: 'test1' })(
    M.file({ name: 'file2.txt' }),
    M.folder({ name: 'test2' })(
      M.file({ name: 'file2.txt' }),
      M.folder({ name: 'test3' })(
        M.file({ name: 'file2.txt' }),
        M.folder({ name: 'test4' })(
          M.file({ name: 'file2.txt' }),
          M.folder({ name: 'test5' })(
            M.file({ name: 'file2.txt' }),
            M.folder({ name: 'test6' })(
              M.file({ name: 'file2.txt' }),
            ),
          ),
        ),
      ),
    ),
  ),
)

const runWithRootCache = M.executeDrive({
  itemByDrivewsid: struct0.itemByDrivewsid,
  cache: pipe(
    C.cache(),
    C.putDetailss([struct0.r.d]),
  ),
})

describe('getFoldersTrees', () => {
  it('getFolderTreeByPathFlattenWP', async () => {
    return pipe(
      /*
      With temp cache `retrieveItemDetailsInFolders` calls are:
      1. get details: root, test1, test2
      2. test3
      3. test4
      4. test5
      5. test6

      Without temp cache:
      1. get details: root, test1, test2
      2. test3
      3. test3, test4
      4. test4, test5
      5. test5, test6
      6. test6
    */
      DriveLookup.getFoldersTreesByPathsDocwsroot(
        [
          npath('/test1/test2'),
          npath('/test1/test2/test3'),
        ],
      ),
      M.executeDrive({
        itemByDrivewsid: struct0.itemByDrivewsid,
        cache: pipe(
          C.cache(),
          C.putDetailss([
            struct0.r.d,
            struct0.r.c.test1.d,
            struct0.r.c.test1.c.test2.d,
          ]),
        ),
      }),
      M.testCallsTE({ total: 5 }),
    )()
  })

  it('with getByPaths and temp cache', async () => {
    return pipe(
      DriveLookup.getByPathsFoldersStrictDocwsroot([
        npath('/test1/test2/test3'),
        npath('/test1/test2'),
        npath('/test1/'),
      ]),
      SRTE.chain(dirs => DriveLookup.getFoldersTrees(dirs, Infinity)),
      DriveLookup.usingTempCache,
      runWithRootCache,
      M.testCallsTE({ total: 7 }),
    )()
  })

  it('must save calls in combination with temp cache', async () => {
    const r0 = await runWithRootCache(DriveLookup.getByPathsFoldersStrictDocwsroot([
      npath('/test1/test2/test3'),
      npath('/test1/test2'),
      npath('/test1/'),
    ]))()

    assert(r0._tag === 'Right')

    const test1 = pipe(
      DriveLookup.getFoldersTrees(r0.right.res, Infinity),
      runWithRootCache,
      M.testCallsTE({ total: 5 }),
    )

    const test2 = pipe(
      DriveLookup.getFoldersTrees(r0.right.res, Infinity),
      DriveLookup.usingTempCache,
      runWithRootCache,
      M.testCallsTE({ total: 3 }),
    )

    return M.allTests(test1, test2)
  })
})
