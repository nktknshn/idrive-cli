import { pipe } from 'fp-ts/lib/function'
import * as R from 'fp-ts/lib/Record'
import * as TE from 'fp-ts/TaskEither'
import { Cache, DriveLookup } from '../../src/icloud-drive'
import { DetailsDocwsRoot, NonRootDetails } from '../../src/icloud-drive/drive-types'
import { FlattenFolderTreeWPath } from '../../src/icloud-drive/util/drive-folder-tree'
import { npath } from '../../src/util/normalize-path'
import { NEA } from '../../src/util/types'
import { executeDrive, fakeicloud, file, folder } from './util/mocked-drive'

import { chain } from '../../src/icloud-drive/drive-lookup'
import { enableDebug } from './debug'

enableDebug(true)

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
    Cache.cachef(),
    Cache.putDetails(structure.r.d),
  ),
})

const check = (
  req: DriveLookup.Lookup<
    NEA<FlattenFolderTreeWPath<DetailsDocwsRoot | NonRootDetails>>
  >,
) => {
  return pipe(
    run(req),
    TE.map(({ calls, res, state }) => {
      expect(res).toEqual(
        [expect.any(Array), expect.any(Array), expect.any(Array)],
      )

      expect(calls().total).toBe(4)

      expect(Cache.getAllDetails(state.cache)).toEqual(
        [expect.anything(), expect.anything(), expect.anything(), expect.anything()],
      )

      expect(
        state.tempCache._tag,
      ).toEqual('None')
    }),
    TE.mapLeft((e) => {
      expect(false).toBe(true)
    }),
  )()
}

describe('usingTempCache', () => {
  const req = DriveLookup.getFoldersTreesByPathsFlattenDocwsroot([
    npath('/test1/test2/'),
    npath('/test1/'),
    npath('/test1/test2/test3/'),
  ])

  it('not nested works', async () => {
    return pipe(req, DriveLookup.usingTempCache, check)
  })

  it('nesting doesnt change the result 2', async () => {
    return pipe(
      DriveLookup.usingTempCache(req),
      DriveLookup.usingTempCache,
      check,
    )
  })

  it('nesting doesnt change the result 3', async () => {
    return pipe(
      DriveLookup.usingTempCache(req),
      DriveLookup.usingTempCache,
      DriveLookup.usingTempCache,
      check,
    )
  })
})

describe('usingTempCache with getByPath method', () => {
  const req = pipe(
    DriveLookup.getByPathDocwsroot(npath('/test1/test2/')),
    chain(() => DriveLookup.getByPathDocwsroot(npath('/test1/'))),
  )

  const run = executeDrive({
    itemByDrivewsid: structure.itemByDrivewsid,
    cache: pipe(
      Cache.cachef(),
      Cache.putDetails(structure.r.d),
    ),
  })

  it('saves a call', async () => {
    return pipe(
      DriveLookup.usingTempCache(req),
      run,
      TE.map(({ calls }) => {
        expect(calls().total).toBe(3)
      }),
      TE.mapLeft((e) => {
        expect(false).toBe(true)
      }),
    )()
  })

  it('works', async () => {
    return pipe(
      run(req),
      TE.map(({ calls }) => {
        expect(calls().total).toBe(4)
      }),
      TE.mapLeft((e) => {
        expect(false).toBe(true)
      }),
    )()
  })
})

describe('missing details are removed from the main cache', () => {
  it('removes details from the main cache', async () => {
    const req = pipe(
      DriveLookup.retrieveItemDetailsInFoldersTempCached([structure.r.c.test1.d.drivewsid]),
      executeDrive({
        itemByDrivewsid: pipe(
          structure.itemByDrivewsid,
          R.deleteAt(
            structure.r.c.test1.d.drivewsid,
          ),
        ),
        // run fully cached
        cache: structure.cache,
      }),
      TE.map(({ calls, res, state }) => {
        expect(res).toEqual([expect.any(Object)])
        expect(calls().total).toBe(1)
        expect(Cache.getAllDetails(state.cache).length).toBe(3)
        // expect(Cache.getAllDetails(state.cache)).toEqual(
        //   [expect.anything(), expect.anything(), expect.anything()],
        // )
        expect(state.tempCache._tag).toEqual('None')
      }),
    )

    return pipe(
      req,
    )()
  })
})
