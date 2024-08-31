import assert from 'assert'
import { pipe } from 'fp-ts/lib/function'
import * as SRTE from 'fp-ts/lib/StateReaderTaskEither'
import * as NA from 'fp-ts/NonEmptyArray'
import * as TE from 'fp-ts/TaskEither'
import { DriveLookup } from '../../src/icloud-drive'
import { NotFoundError } from '../../src/icloud-drive/drive-lookup/errors'
import { showFolderTree } from '../../src/icloud-drive/util/drive-folder-tree'
import { invalidPath, validPath } from '../../src/icloud-drive/util/get-by-path-types'
import { normalizePath, npath } from '../../src/util/normalize-path'
import './debug'
import { enableDebug } from './debug'
import { complexStructure0 } from './fixtures/drive'
import { createEnv, createState, executeDrive, fakeicloud, file, folder } from './util/mocked-drive'

enableDebug(false)

describe('retrieveItemDetailsInFoldersSaving', () => {
  it('works', async () => {
    const state = createState({})
    const env = createEnv(complexStructure0.itemByDrivewsid)
    const req = pipe(
      DriveLookup.getByPathDocwsroot(
        npath('/test2/file1.txt'),
      ),
    )

    const res1 = await req(state)(env)()

    assert(res1._tag === 'Right')

    assert(res1.right[0].valid)
    assert('file' in res1.right[0])

    assert.deepEqual(
      res1.right[0].file,
      complexStructure0.r.children[1].children[0].d,
    )
  })

  it('searchGlobs', async () => {
    const req0 = pipe(
      DriveLookup.searchGlobs(['/*.txt']),
      executeDrive({ itemByDrivewsid: complexStructure0.itemByDrivewsid }),
      TE.map(({ calls, res, state }) => {
        assert.deepEqual(
          res,
          [[{
            path: '/fileinroot.txt',
            item: complexStructure0.r.c['fileinroot.txt'].d,
          }]],
        )
      }),
    )

    assert((await req0())._tag === 'Right')
  })

  it('getFoldersTrees', async () => {
    const { itemByDrivewsid: details, r: tree } = fakeicloud(
      file({ name: 'file1.txt' }),
      folder({ name: 'test1' })(
        file({ name: 'file2.txt' }),
      ),
    )

    return pipe(
      DriveLookup.chainCachedDocwsRoot(root =>
        DriveLookup.getFoldersTrees([
          root,
          root,
          root,
        ], Infinity)
      ),
      SRTE.map(NA.map(showFolderTree)),
    )
  })
})

describe('getByPaths', () => {
  it('gets', async () => {
    const req0 = pipe(
      executeDrive({
        itemByDrivewsid: complexStructure0.itemByDrivewsid,
      })(
        DriveLookup.getByPathsDocwsroot([normalizePath('/')]),
      ),
      TE.map(({ calls, res, state }) => {
        assert.deepEqual(
          res,
          [validPath([complexStructure0.r.d])],
        )
      }),
    )

    assert((await req0())._tag === 'Right')
  })

  it('gets2', async () => {
    const req0 = pipe(
      executeDrive({
        itemByDrivewsid: complexStructure0.itemByDrivewsid,
      })(
        DriveLookup.getByPathsDocwsroot([
          npath('/Obsidian/my1/misc'),
          npath('/Obsidian/my1/mi'),
        ]),
      ),
      TE.map(({ calls, res, state }) => {
        expect(res).toEqual(
          [
            validPath([
              complexStructure0.r.d,
              complexStructure0.r.c.Obsidian.d,
              complexStructure0.r.c.Obsidian.c.my1.d,
              complexStructure0.r.c.Obsidian.c.my1.c.misc.d,
            ]),
            invalidPath(
              [
                complexStructure0.r.d,
                complexStructure0.r.c.Obsidian.d,
                complexStructure0.r.c.Obsidian.c.my1.d,
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
  })
})
