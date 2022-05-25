import assert from 'assert'
import { pipe } from 'fp-ts/lib/function'
import * as SRTE from 'fp-ts/lib/StateReaderTaskEither'
import * as TE from 'fp-ts/TaskEither'
import { DriveLookup } from '../../../src/icloud-drive'
import * as C from '../../../src/icloud-drive/drive-lookup/cache'
import * as L from '../../../src/util/logging'
import { npath } from '../../../src/util/normalize-path'
import '../debug'
import { enableDebug } from '../debug'
import { executeDrive, fakeicloud } from '../util/mocked-drive'
import { file, folder } from '../util/mocked-drive'

// enableDebug(true)

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

const runWithRootData = executeDrive({
  itemByDrivewsid: struct0.itemByDrivewsid,
  cache: pipe(
    C.cachef(),
    C.putDetailss([
      struct0.r.d,
    ]),
  ),
})

describe('getFoldersTrees', () => {
  it('with getByPaths and temp cache', async () => {
    return pipe(
      DriveLookup.getByPathsFoldersStrictDocwsroot([
        npath('/test1/test2/test3'),
        npath('/test1/test2'),
        npath('/test1/'),
      ]),
      SRTE.chain(dirs => DriveLookup.getFoldersTrees(dirs, Infinity)),
      DriveLookup.usingTempCache,
      runWithRootData,
      TE.map(({ calls }) => {
        expect(calls().total).toBe(7)
      }),
      TE.mapLeft(() => {
        expect(false).toBe(true)
      }),
    )()
  })

  it('must save calls in combination with temp cache', async () => {
    const r0 = await runWithRootData(DriveLookup.getByPathsFoldersStrictDocwsroot([
      npath('/test1/test2/test3'),
      npath('/test1/test2'),
      npath('/test1/'),
    ]))()

    assert(r0._tag === 'Right')

    const req1 = pipe(
      DriveLookup.getFoldersTrees(r0.right.res, Infinity),
      runWithRootData,
      TE.map(({ calls }) => {
        expect(calls().total).toBe(5)
      }),
      TE.mapLeft(() => {
        expect(false).toBe(true)
      }),
    )

    const req2 = pipe(
      DriveLookup.getFoldersTrees(r0.right.res, Infinity),
      DriveLookup.usingTempCache,
      runWithRootData,
      TE.map(({ calls }) => {
        expect(calls().total).toBe(3)
      }),
      TE.mapLeft(() => {
        expect(false).toBe(true)
      }),
    )

    return pipe(
      TE.sequenceSeqArray([req1, req2]),
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
      TE.map(({ calls }) => {
        expect(calls().total).toBe(5)
      }),
      TE.mapLeft(() => {
        expect(false).toBe(true)
      }),
    )()
  })
})
