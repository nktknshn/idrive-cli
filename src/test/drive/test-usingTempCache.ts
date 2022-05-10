import assert from 'assert'
import { pipe } from 'fp-ts/lib/function'
import * as TE from 'fp-ts/TaskEither'
import { C, DriveLookup, GetDep } from '../../icloud-drive'
import { usingTempCache } from '../../icloud-drive/drive-lookup'
import { DetailsDocwsRoot, NonRootDetails } from '../../icloud-drive/icloud-drive-items-types'
import { FlattenFolderTreeWithP } from '../../icloud-drive/util/drive-folder-tree'
import * as L from '../../util/logging'
import { npath } from '../../util/normalize-path'
import { NEA } from '../../util/types'
import { file, folder } from './helpers-drive'
import { executeDrive, fakeicloud } from './struct'

L.initLoggers(
  { debug: true },
  [
    L.logger,
    L.cacheLogger,
    L.stderrLogger,
    L.apiLogger,
  ],
)

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

  const req = usingTempCache(
    DriveLookup.getFoldersTreesByPathFlattenWPDocwsroot([
      npath('/test1/test2/'),
      npath('/test1/'),
      npath('/test1/test2/test3/'),
    ]),
  )

  const check = (
    req: DriveLookup.Effect<
      NEA<FlattenFolderTreeWithP<DetailsDocwsRoot | NonRootDetails>>
    >,
  ) => {
    return pipe(
      req,
      run,
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

        expect(
          C.getAllDetails(state.tempCache),
        ).toEqual([])

        expect(
          state.tempCacheActive,
        ).toEqual(false)
      }),
      TE.mapLeft((e) => {
        expect(false).toBe(true)
      }),
    )()
  }

  it('works1', async () => {
    return pipe(
      req,
      usingTempCache,
      check,
    )
  })

  it('works2', async () => {
    return pipe(
      usingTempCache(req),
      usingTempCache,
      check,
    )
  })

  it('works3', async () => {
    return pipe(
      usingTempCache(req),
      usingTempCache,
      usingTempCache,
      check,
    )
  })
})
