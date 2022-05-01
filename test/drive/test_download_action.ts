import assert from 'assert'
import { pipe } from 'fp-ts/lib/function'
import * as SRTE from 'fp-ts/lib/StateReaderTaskEither'
import * as NA from 'fp-ts/NonEmptyArray'
import * as TE from 'fp-ts/TaskEither'
import { C, DriveQuery } from '../../src/icloud/drive'
import { NotFoundError } from '../../src/icloud/drive/drive-query/errors'
import { showFolderTree } from '../../src/icloud/drive/util/folder-tree'
import { invalidPath, validPath } from '../../src/icloud/drive/util/get-by-path-types'
import * as L from '../../src/util/logging'
import { normalizePath, npath } from '../../src/util/normalize-path'
import { complexStructure0 } from './fixtures'
import { appLibrary, file, folder } from './helpers-drive'
import { createEnv, createState, executeDrive, fakeicloud } from './struct'

import * as DA from '../../src/icloud/drive/drive-action'
import * as D from '../../src/icloud/drive/drive-action/actions/download/download-conflict'
import { downloadTaskMapper } from '../../src/icloud/drive/drive-action/actions/download/download-helpers'
downloadTaskMapper
DA.download

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
    const state = createState({})
    const env = createEnv(complexStructure0.itemByDrivewsid)
    const req = pipe(
      DriveQuery.getByPathDocwsroot(
        npath('/test2/file1.txt'),
      ),
    )

    const res1 = await req(state)(env)()

    assert(res1._tag === 'Right')

    assert(res1.right[0].valid)
    assert(res1.right[0].file._tag === 'Some')

    assert.deepEqual(
      res1.right[0].file.value,
      complexStructure0.root.children[1].children[0].details,
    )
  })

  it('searchGlobs', async () => {
    const req0 = pipe(
      DriveQuery.searchGlobs(['/*.txt']),
      executeDrive({ itemByDrivewsid: complexStructure0.itemByDrivewsid }),
      TE.map(({ calls, res, state }) => {
        assert.deepEqual(
          res,
          [[{
            path: '/fileinroot.txt',
            item: complexStructure0.root.byName['fileinroot.txt'],
          }]],
        )
      }),
    )

    assert((await req0())._tag === 'Right')
  })

  it('getFoldersTrees', async () => {
    const { itemByDrivewsid: details, root: tree } = fakeicloud(
      file({ name: 'file1.txt' }),
      folder({ name: 'test1' })(
        file({ name: 'file2.txt' }),
      ),
    )

    const env = createEnv(details)
    const cache = pipe(
      C.cachef(),
      C.putDetails(tree.details),
    )

    assert(cache._tag === 'Right')

    const state = createState({ cache: cache.right })

    const req0 = pipe(
      DriveQuery.chainCachedDocwsRoot(root =>
        DriveQuery.getFoldersTrees([
          root,
          root,
          root,
        ], Infinity)
      ),
      SRTE.map(NA.map(showFolderTree)),
    )

    console.log(
      await req0(state)(env)(),
    )
  })
})

describe('getByPaths', () => {
  it('gets', async () => {
    const req0 = pipe(
      executeDrive({
        itemByDrivewsid: complexStructure0.itemByDrivewsid,
      })(
        DriveQuery.getByPathsDocwsroot([normalizePath('/')]),
      ),
      TE.map(({ calls, res, state }) => {
        assert.deepEqual(
          res,
          [validPath([complexStructure0.root.details])],
        )
      }),
    )

    assert((await req0())._tag === 'Right')
  })

  it('gets2', async () => {
    const req0 = pipe(
      executeDrive({
        itemByDrivewsid: complexStructure0.itemByDrivewsid,
        // cache: pipe(
        // C.cachef(),
        // C.putDetails(complexStructure0.root.details),
        // ),
      })(
        DriveQuery.getByPathsDocwsroot([
          npath('/Obsidian/my1/misc'),
          npath('/Obsidian/my1/mi'),
        ]),
      ),
      TE.map(({ calls, res, state }) => {
        expect(res).toEqual(
          [
            validPath([
              complexStructure0.root.details,
              complexStructure0.root.byName.Obsidian.details,
              complexStructure0.root.byName.Obsidian.byName.my1.details,
              complexStructure0.root.byName.Obsidian.byName.my1.byName.misc.details,
            ]),
            invalidPath(
              [
                complexStructure0.root.details,
                complexStructure0.root.byName.Obsidian.details,
                complexStructure0.root.byName.Obsidian.byName.my1.details,
              ],
              ['mi'],
              expect.any(NotFoundError),
            ),
          ],
        )

        expect(calls().retrieveItemDetailsInFolders).toBe(5)
      }),
    )

    assert((await req0())._tag === 'Right')

    // console.log(
    //   await req0(),
    // )
  })
})
