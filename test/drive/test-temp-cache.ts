import { pipe } from 'fp-ts/lib/function'
import * as R from 'fp-ts/lib/Record'
import * as SRTE from 'fp-ts/lib/StateReaderTaskEither'
import * as TE from 'fp-ts/TaskEither'
import { Cache, DriveLookup } from '../../src/icloud-drive'
import { DetailsDocwsRoot, NonRootDetails } from '../../src/icloud-drive/drive-types'
import { FlattenWithItems } from '../../src/icloud-drive/util/drive-folder-tree'
import { npath } from '../../src/util/normalize-path'
import { NEA } from '../../src/util/types'
import { executeDrive, fakeicloud, file, folder } from './util/mocked-drive'

import { chain } from '../../src/icloud-drive/drive-lookup'
import { enableDebug } from './debug'

enableDebug(false)

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
    Cache.cache(),
    Cache.putDetails(structure.r.d),
  ),
})

const check = (
  req: DriveLookup.Lookup<NEA<FlattenWithItems<DetailsDocwsRoot | NonRootDetails>>>,
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

describe('usingTempCache with getByPath method', () => {
  const req = pipe(
    DriveLookup.getByPathDocwsroot(npath('/test1/test2/')),
    chain(() => DriveLookup.getByPathDocwsroot(npath('/test1/'))),
  )

  // const req2 = pipe(
  //   DriveLookup.getByPathsDocwsroot(
  //     [npath('/test1/test2/'), npath('/test1/')],
  //   ),
  // )
  // 3 calls
  // getByPaths itself does not require temp cache

  const run = executeDrive({
    itemByDrivewsid: structure.itemByDrivewsid,
    cache: pipe(
      Cache.cache(),
      Cache.putDetails(structure.r.d),
    ),
  })

  /*
   Without temp cache `retrieveItemDetailsInFolders` calls are:
   1. get details: root
   2. test1
   3. test2
   4. root, test1
  */
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

  /*
   With temp cache `retrieveItemDetailsInFolders` calls are:
   1. get details: root
   2. test1
   3. test2
   */

  it('saves a call', async () => {
    return pipe(
      req,
      DriveLookup.usingTempCache,
      run,
      TE.map(({ calls }) => {
        expect(calls().total).toBe(3)
      }),
      TE.mapLeft((e) => {
        expect(false).toBe(true)
      }),
    )()
  })
})

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

describe('missing details are removed from the main cache', () => {
  const req = DriveLookup.retrieveItemDetailsInFoldersTempCached([structure.r.c.test1.d.drivewsid])
  const run = executeDrive({
    itemByDrivewsid: pipe(
      structure.itemByDrivewsid,
      R.deleteAt(structure.r.c.test1.d.drivewsid),
    ),
    // run fully cached
    cache: structure.cache,
  })

  const check = (req: DriveLookup.Lookup<any>) =>
    pipe(
      run(req),
      TE.map(({ calls, res, state }) => {
        expect(res).toEqual([expect.any(Object)])
        expect(calls().total).toBe(1)
        // verify that the cache does not contain the removed details
        expect(Cache.getAllDetails(state.cache)).toEqual(
          [expect.anything(), expect.anything(), expect.anything()],
        )

        // verify that the temp cache is cleared
        expect(state.tempCache._tag).toEqual('None')
        expect(state.tempCacheMissingDetails.length).toEqual(0)
      }),
    )

  it('works when temp cache is not active', async () => {
    return pipe(req, check)()
  })

  it('works when temp cache is active', async () => {
    return pipe(
      req,
      DriveLookup.usingTempCache,
      check,
    )()
  })
})

describe('nesting does not break behavior', () => {
  const req = pipe(
    DriveLookup.usingTempCache(
      pipe(
        DriveLookup.retrieveItemDetailsInFoldersTempCached([structure.r.c.test1.d.drivewsid]),
        SRTE.chain(() =>
          DriveLookup.usingTempCache(
            DriveLookup.retrieveItemDetailsInFoldersTempCached([
              structure.r.c.test1.c.test2.d.drivewsid,
              structure.r.c.test1.c.test2.c.test3.d.drivewsid,
            ]),
          )
        ),
      ),
    ),
  )

  const run = executeDrive({
    itemByDrivewsid: pipe(
      structure.itemByDrivewsid,
      R.deleteAt(structure.r.c.test1.c.test2.c.test3.d.drivewsid),
    ),
    cache: pipe(
      Cache.cache(),
      Cache.putDetails(structure.r.c.test1.c.test2.c.test3.d),
    ),
  })

  const check = (req: DriveLookup.Lookup<any>) =>
    pipe(
      run(req),
      TE.map(({ calls, res, state }) => {
        expect(res).toEqual([
          expect.objectContaining({ _tag: 'Some' }),
          expect.objectContaining({ _tag: 'None' }),
        ])
        expect(calls().total).toBe(2)
        // verify that the cache does not contain the removed details
        expect(Cache.keys(state.cache)).toEqual(
          [structure.r.c.test1.d.drivewsid, structure.r.c.test1.c.test2.d.drivewsid],
        )
      }),
    )

  it('does not break behavior', async () => {
    return pipe(req, check)()
  })
})
