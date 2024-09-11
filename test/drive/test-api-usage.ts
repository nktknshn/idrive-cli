import { flow, pipe } from 'fp-ts/lib/function'
import * as NA from 'fp-ts/lib/NonEmptyArray'
import * as SRTE from 'fp-ts/lib/StateReaderTaskEither'
import * as O from 'fp-ts/Option'
import { Cache, DriveCache, DriveLookup, GetByPath, Types } from '../../src/icloud-drive'
import { MissingRootError, NotFoundError } from '../../src/icloud-drive/drive-lookup/errors'
import { npath } from '../../src/util/normalize-path'
import { NEA } from '../../src/util/types'
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

const validPathTest1 = GetByPath.validPath([structure.r.d, structure.r.c.test1.d])
const validPathTest2 = GetByPath.validPath([structure.r.d, structure.r.c.test1.d, structure.r.c.test1.c.test2.d])

const execStructure = M.executeDriveS(structure.itemByDrivewsid)

describe('apiUsage with retrieveItemDetailsInFoldersTempCached', () => {
  const req = DriveLookup.retrieveItemDetailsInFoldersCached([structure.r.c.test1.d.drivewsid])

  it('works with retrieveItemDetailsInFoldersCached(onlycache)', () => {
    const test1 = pipe(
      req,
      execStructure({ apiUsage: 'onlycache' }),
      M.testCallsTE({ retrieveItemDetailsInFolders: 0 }),
      M.testExpectResTE(_ => _.toEqual([O.none])),
    )

    const test2 = pipe(
      req,
      execStructure({
        apiUsage: 'onlycache',
        cache: structure.cache,
      }),
      M.testCallsTE({ retrieveItemDetailsInFolders: 0 }),
      M.testExpectResTE(_ => _.toEqual([O.some(structure.r.c.test1.d)])),
    )

    return M.allTests(test1, test2)
  })

  // same behavior for fallback and always
  it('works with retrieveItemDetailsInFoldersCached(fallback/always)', () => {
    const test1 = pipe(
      req,
      execStructure({ apiUsage: 'fallback' }),
      M.testCallsTE({ retrieveItemDetailsInFolders: 1 }),
      M.testExpectResTE(_ => _.toEqual([O.some(structure.r.c.test1.d)])),
    )

    const test2 = pipe(
      req,
      M.executeDrive({
        itemByDrivewsid: structure.itemByDrivewsid,
        apiUsage: 'fallback',
        cache: structure.cache,
      }),
      M.testCallsTE({ retrieveItemDetailsInFolders: 0 }),
      M.testExpectResTE(_ => _.toEqual([O.some(structure.r.c.test1.d)])),
    )

    const test3 = pipe(
      req,
      execStructure({ apiUsage: 'always' }),
      M.testCallsTE({ retrieveItemDetailsInFolders: 1 }),
      M.testExpectResTE(_ => _.toEqual([O.some(structure.r.c.test1.d)])),
    )

    const test4 = pipe(
      req,
      execStructure({ apiUsage: 'always', cache: structure.cache }),
      M.testCallsTE({ retrieveItemDetailsInFolders: 0 }),
      M.testExpectResTE(_ => _.toEqual([O.some(structure.r.c.test1.d)])),
    )

    return M.allTests(test1, test2, test3, test4)
  })

  it('works with retrieveItemDetailsInFoldersTempCached(onlycache)', () => {
    const req = DriveLookup.retrieveItemDetailsInFoldersTempCached(
      [structure.r.c.test1.d.drivewsid],
    )

    const test1 = pipe(
      req,
      execStructure({ apiUsage: 'onlycache' }),
      M.testCallsTE({ retrieveItemDetailsInFolders: 0 }),
      M.testExpectResTE(_ => _.toEqual([O.none])),
    )

    const test2 = pipe(
      req,
      execStructure({
        apiUsage: 'onlycache',
        cache: structure.cache,
      }),
      M.testCallsTE({ retrieveItemDetailsInFolders: 0 }),
      M.testExpectResTE(_ => _.toEqual([O.some(structure.r.c.test1.d)])),
    )

    return M.allTests(test1, test2)
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
})

describe('apiUsage with getByPaths', () => {
  const req = DriveLookup.getByPathsDocwsroot([
    npath('/test1/test2/'),
    npath('/test1/'),
  ])

  type ReqResult = DriveLookup.Lookup<NEA<GetByPath.Result<Types.DetailsDocwsRoot>>>

  const reqChained = pipe(
    DriveLookup.getByPathDocwsroot(npath('/test1/test2/')),
    SRTE.bindTo('res1'),
    SRTE.bind('res2', () => DriveLookup.getByPathDocwsroot(npath('/test1/'))),
    SRTE.map(({ res1, res2 }) => NA.fromReadonlyNonEmptyArray([res1, res2])),
  )

  const reqChainedTempCached = pipe(
    DriveLookup.usingTempCache(reqChained),
  )

  it('works with getByPaths(onlycache)', async () => {
    // test without cache. Missing root is an error
    const test1 = flow(
      execStructure({ apiUsage: 'onlycache' }),
      M.testErrorIs(MissingRootError.is),
    )

    // works when fully cached
    const test2 = flow(
      execStructure({ apiUsage: 'onlycache', cache: structure.cache }),
      M.testCallsTE({ retrieveItemDetailsInFolders: 0 }),
      M.testResTE(res =>
        expect(res).toMatchObject([
          validPathTest2,
          validPathTest1,
        ])
      ),
    )

    // works when partially cached
    const test3 = flow(
      execStructure({
        apiUsage: 'onlycache',
        cache: pipe(
          Cache.cache(),
          Cache.putDetailss([structure.r.d, structure.r.c.test1.d]),
        ),
      }),
      M.testCallsTE({ retrieveItemDetailsInFolders: 0 }),
      M.testResTE(res =>
        expect(res).toMatchObject([
          GetByPath.invalidPath([structure.r.d, structure.r.c.test1.d], ['test2'], expect.any(Error)),
          validPathTest1,
        ])
      ),
    )

    return M.allTests(
      test1(req),
      test1(reqChainedTempCached),
      test2(req),
      test2(reqChainedTempCached),
      test3(req),
      test3(reqChainedTempCached),
    )
  })

  it('works with getByPaths(fallback)', () => {
    // test without cache. Expected 3 calls: root, test1, test2
    const test1 = flow(
      execStructure({ apiUsage: 'fallback' }),
      M.testCallsTE({
        retrieveItemDetailsInFolders: 3,
        retrieveItemDetailsInFoldersIds: [
          [structure.r.d.drivewsid],
          [structure.r.c.test1.d.drivewsid],
          [structure.r.c.test1.c.test2.d.drivewsid],
        ],
      }),
    )

    // works partially cached. Expected 1 call
    const test2 = flow(
      execStructure({
        apiUsage: 'fallback',
        cache: pipe(
          Cache.cache(),
          Cache.putDetailss([structure.r.d, structure.r.c.test1.d]),
        ),
      }),
      M.testCallsTE({
        retrieveItemDetailsInFolders: 1,
        retrieveItemDetailsInFoldersIds: [[structure.r.c.test1.c.test2.d.drivewsid]],
      }),
      M.testResTE(res => expect(res).toMatchObject([validPathTest2, validPathTest1])),
    )

    // works when fully cached. Expected 0 calls
    const test3 = flow(
      execStructure({
        apiUsage: 'fallback',
        cache: structure.cache,
      }),
      M.testCallsTE({ retrieveItemDetailsInFolders: 0 }),
      M.testResTE(res => expect(res).toMatchObject([validPathTest2, validPathTest1])),
    )

    return M.allTests(
      test1(req),
      test1(reqChainedTempCached),
      test2(req),
      test2(reqChainedTempCached),
      test3(req),
      test3(reqChainedTempCached),
    )
  })

  it('works with getByPaths(always)', () => {
    // test without cache. Expected 4 calls: root, root, test1, test2
    const test1 = flow(
      execStructure({ apiUsage: 'always' }),
      M.testCallsTE({
        retrieveItemDetailsInFolders: 4,
        retrieveItemDetailsInFoldersIds: [
          // chainCache
          [structure.r.d.drivewsid],
          // getByPaths
          [structure.r.d.drivewsid],
          [structure.r.c.test1.d.drivewsid],
          [structure.r.c.test1.c.test2.d.drivewsid],
        ],
      }),
    )

    // test partially cached. Expected 2 calls
    const test2 = flow(
      execStructure({
        apiUsage: 'always',
        cache: pipe(
          Cache.cache(),
          Cache.putDetailss([structure.r.d, structure.r.c.test1.d]),
        ),
      }),
      M.testCallsTE({
        retrieveItemDetailsInFolders: 2,
        retrieveItemDetailsInFoldersIds: [
          // validate cached paths
          [structure.r.d.drivewsid, structure.r.c.test1.d.drivewsid],
          // getByPaths
          [structure.r.c.test1.c.test2.d.drivewsid],
        ],
      }),
      M.testResTE(res => expect(res).toMatchObject([validPathTest2, validPathTest1])),
    )

    // test fully cached. Expected 1 call
    const test3 = flow(
      execStructure({
        apiUsage: 'always',
        cache: structure.cache,
      }),
      M.testCallsTE({ retrieveItemDetailsInFolders: 1 }),
      M.testCallsTE({
        retrieveItemDetailsInFolders: 1,
        retrieveItemDetailsInFoldersIds: [[
          structure.r.d.drivewsid,
          structure.r.c.test1.d.drivewsid,
          structure.r.c.test1.c.test2.d.drivewsid,
        ]],
      }),
      M.testResTE(res => expect(res).toMatchObject([validPathTest2, validPathTest1])),
    )

    return M.allTests(
      test1(req),
      test1(reqChainedTempCached),
      test2(req),
      test2(reqChainedTempCached),
      test3(req),
      test3(reqChainedTempCached),
    )
  })
})
