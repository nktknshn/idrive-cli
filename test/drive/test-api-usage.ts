import { pipe } from 'fp-ts/lib/function'
import * as O from 'fp-ts/Option'
import { Cache, DriveCache, DriveLookup, GetByPath } from '../../src/icloud-drive'
import { MissingRootError, NotFoundError } from '../../src/icloud-drive/drive-lookup/errors'
import { npath } from '../../src/util/normalize-path'
import { enableDebug } from './debug'
import * as M from './util/mocked-drive'

enableDebug(false)

const structure = M.fakeicloud(
  M.file({ name: 'fileinroot.txt' }),
  M.file({ name: 'fileinroot2.txt' }),
  M.folder({ name: 'test1' })(
    M.file({ name: 'package.json' }),
    M.folder({ name: 'test2' })(
      M.file({ name: 'package.json' }),
      M.folder({ name: 'test3' })(),
    ),
  ),
)

const execStructure = M.executeDriveS(structure.itemByDrivewsid)

describe('apiUsage', () => {
  const req = DriveLookup.retrieveItemDetailsInFoldersCached([structure.r.c.test1.d.drivewsid])

  it('works with retrieveItemDetailsInFoldersCached(onlycache)', async () => {
    const test1 = pipe(
      req,
      execStructure({ apiUsage: 'onlycache' }),
      M.testCallsTE({ retrieveItemDetailsInFolders: 0 }),
      M.testExpectResTE(_ => _.toEqual([O.none])),
    )()

    const test2 = pipe(
      req,
      execStructure({
        apiUsage: 'onlycache',
        cache: structure.cache,
      }),
      M.testCallsTE({ retrieveItemDetailsInFolders: 0 }),
      M.testExpectResTE(_ => _.toEqual([O.some(structure.r.c.test1.d)])),
    )()

    return await Promise.all([test1, test2])
  })

  // same behavior for fallback and always
  it('works with retrieveItemDetailsInFoldersCached(fallback/always)', async () => {
    const test1 = pipe(
      req,
      execStructure({ apiUsage: 'fallback' }),
      M.testCallsTE({ retrieveItemDetailsInFolders: 1 }),
      M.testExpectResTE(_ => _.toEqual([O.some(structure.r.c.test1.d)])),
    )()

    const test2 = pipe(
      req,
      M.executeDrive({
        itemByDrivewsid: structure.itemByDrivewsid,
        apiUsage: 'fallback',
        cache: structure.cache,
      }),
      M.testCallsTE({ retrieveItemDetailsInFolders: 0 }),
      M.testExpectResTE(_ => _.toEqual([O.some(structure.r.c.test1.d)])),
    )()

    const test3 = pipe(
      req,
      execStructure({ apiUsage: 'always' }),
      M.testCallsTE({ retrieveItemDetailsInFolders: 1 }),
      M.testExpectResTE(_ => _.toEqual([O.some(structure.r.c.test1.d)])),
    )()

    const test4 = pipe(
      req,
      execStructure({ apiUsage: 'always', cache: structure.cache }),
      M.testCallsTE({ retrieveItemDetailsInFolders: 0 }),
      M.testExpectResTE(_ => _.toEqual([O.some(structure.r.c.test1.d)])),
    )()

    return await Promise.all([test1, test2, test3, test4])
  })

  it('works with retrieveItemDetailsInFoldersTempCached(onlycache)', async () => {
    const req = DriveLookup.retrieveItemDetailsInFoldersTempCached(
      [structure.r.c.test1.d.drivewsid],
    )

    const test1 = pipe(
      req,
      execStructure({ apiUsage: 'onlycache' }),
      M.testCallsTE({ retrieveItemDetailsInFolders: 0 }),
      M.testExpectResTE(_ => _.toEqual([O.none])),
    )()

    const test2 = pipe(
      req,
      execStructure({
        apiUsage: 'onlycache',
        cache: structure.cache,
      }),
      M.testCallsTE({ retrieveItemDetailsInFolders: 0 }),
      M.testExpectResTE(_ => _.toEqual([O.some(structure.r.c.test1.d)])),
    )()

    return await Promise.all([test1, test2])
  })

  it('works with retrieveItemDetailsInFoldersTempCached(fallback)', () => {
    const req = DriveLookup.retrieveItemDetailsInFoldersTempCached(
      [structure.r.c.test1.d.drivewsid],
    )

    const test1 = pipe(
      execStructure({ apiUsage: 'fallback' })(req),
      M.testCallsTE({ retrieveItemDetailsInFolders: 1 }),
      M.testExpectResTE(_ => _.toEqual([O.some(structure.r.c.test1.d)])),
      M.testCacheTE(_ => expect(DriveCache.keysCount(_)).toBe(1)),
    )()

    const test2 = pipe(
      execStructure({ cache: structure.cache, apiUsage: 'fallback' })(req),
      M.testCallsTE({ retrieveItemDetailsInFolders: 0 }),
      M.testExpectResTE(_ => _.toEqual([O.some(structure.r.c.test1.d)])),
    )()

    return Promise.all([test1, test2])
  })

  it('works with retrieveItemDetailsInFoldersTempCached(always)', () => {
    const req = DriveLookup.retrieveItemDetailsInFoldersTempCached(
      [structure.r.c.test1.d.drivewsid],
    )

    const test1 = pipe(
      execStructure({ apiUsage: 'always' })(req),
      M.testCallsTE({ retrieveItemDetailsInFolders: 1 }),
      M.testExpectResTE(_ => _.toEqual([O.some(structure.r.c.test1.d)])),
      M.testCacheTE(_ => expect(DriveCache.keysCount(_)).toBe(1)),
    )

    const test2 = pipe(
      execStructure({ cache: structure.cache, apiUsage: 'always' })(req),
      M.testCallsTE({ retrieveItemDetailsInFolders: 1 }),
      M.testExpectResTE(_ => _.toEqual([O.some(structure.r.c.test1.d)])),
    )()

    return Promise.all([test1, test2])
  })

  it('works with getByPaths(onlycache)', async () => {
    const req = DriveLookup.getByPathsDocwsroot([
      npath('/test1/test2/'),
      npath('/test1/'),
    ])

    // Missing root is an error
    const test1 = pipe(
      execStructure({ apiUsage: 'onlycache' })(req),
      M.testErrorIs(MissingRootError.is),
    )()

    const test2 = pipe(
      req,
      execStructure({ apiUsage: 'onlycache', cache: structure.cache }),
      M.testCallsTE({ retrieveItemDetailsInFolders: 0 }),
      M.testResTE(res =>
        expect(res).toMatchObject([
          GetByPath.validPath([structure.r.d, structure.r.c.test1.d, structure.r.c.test1.c.test2.d]),
          GetByPath.validPath([structure.r.d, structure.r.c.test1.d]),
        ])
      ),
    )()

    const test3 = pipe(
      execStructure({
        apiUsage: 'onlycache',
        cache: pipe(
          Cache.cache(),
          Cache.putDetailss([structure.r.d]),
        ),
      })(req),
      M.testCallsTE({ retrieveItemDetailsInFolders: 0 }),
      M.testResTE(res =>
        expect(res).toMatchObject([
          GetByPath.invalidPath([structure.r.d], ['test1', 'test2'], expect.any(NotFoundError)),
          GetByPath.invalidPath([structure.r.d], ['test1'], expect.any(NotFoundError)),
        ])
      ),
    )()

    return await Promise.all([test1, test2, test3])
  })
})
