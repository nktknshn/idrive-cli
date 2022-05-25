import assert from 'assert'
import { pipe } from 'fp-ts/lib/function'
import * as TE from 'fp-ts/TaskEither'
import { C, DriveLookup, GetDep } from '../../src/icloud-drive'
import { DetailsDocwsRoot, NonRootDetails } from '../../src/icloud-drive/icloud-drive-items-types'
import { FlattenFolderTreeWithP } from '../../src/icloud-drive/util/drive-folder-tree'
import * as L from '../../src/util/logging'
import { npath } from '../../src/util/normalize-path'
import { NEA } from '../../src/util/types'
import { file, folder } from './util/helpers-drive'
import { executeDrive, fakeicloud } from './util/struct'

import './debug'

describe('usingTempCache', () => {
  const structure = fakeicloud(
    file({ name: 'fileinroot.txt' }),
    file({ name: 'fileinroot2.txt' }),
    folder({ name: 'test1' })(
      file({ name: 'package.json' }),
      folder({ name: 'test2' })(
        file({ name: 'package.json' }),
        folder({ name: 'test3' })(),
      ),
    ),
  )

  const run = executeDrive({
    itemByDrivewsid: structure.itemByDrivewsid,
    cache: pipe(
      C.cachef(),
      C.putDetails(structure.r.d),
    ),
  })

  const req = DriveLookup.getFoldersTreesByPathFlattenWPDocwsroot([
    npath('/test1/test2/'),
    npath('/test1/'),
    npath('/test1/test2/test3/'),
  ])

  const check = (
    req: DriveLookup.Effect<
      NEA<FlattenFolderTreeWithP<DetailsDocwsRoot | NonRootDetails>>
    >,
  ) => {
    return pipe(
      run(req),
      TE.map(({ calls, res, state }) => {
        expect(res).toEqual(
          [expect.any(Array), expect.any(Array), expect.any(Array)],
        )

        expect(
          calls().total,
        ).toBe(4)

        expect(C.getAllDetails(state.cache)).toEqual(
          [expect.anything(), expect.anything(), expect.anything(), expect.anything()],
        )

        // assert(state.tempCache._tag === 'None')
        expect(
          // C.getAllDetails(state.tempCache.value),
          state.tempCache._tag,
        ).toEqual('None')

        // expect(
        //   state.tempCacheActive,
        // ).toEqual(false)
      }),
      TE.mapLeft((e) => {
        expect(false).toBe(true)
      }),
    )()
  }

  it('works1', async () => {
    return pipe(
      req,
      DriveLookup.usingTempCache,
      check,
    )
  })

  it('works2', async () => {
    return pipe(
      DriveLookup.usingTempCache(req),
      DriveLookup.usingTempCache,
      check,
    )
  })

  it('works3', async () => {
    return pipe(
      DriveLookup.usingTempCache(req),
      DriveLookup.usingTempCache,
      DriveLookup.usingTempCache,
      check,
    )
  })
})
