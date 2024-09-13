import { flow, pipe } from 'fp-ts/lib/function'
import * as NA from 'fp-ts/lib/NonEmptyArray'
import * as SRTE from 'fp-ts/lib/StateReaderTaskEither'
import * as O from 'fp-ts/Option'
import { Cache, DriveCache, DriveLookup, DriveTree, GetByPath, Types } from '../../src/icloud-drive'
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

    // works when partially cached. Expected 1 calls to check if there is a new item
    const test4 = pipe(
      DriveLookup.getByPathDocwsroot(npath('/test666/')),
      execStructure({
        apiUsage: 'fallback',
        cache: Cache.createWithDetailss([
          structure.r.d,
          structure.r.c.test1.d,
        ]),
      }),
      M.testCallsTE({ retrieveItemDetailsInFolders: 1 }),
      M.testResTE(res =>
        expect(res).toEqual(
          expect.objectContaining({ valid: false }),
        )
      ),
    )

    // same with temp cache
    const test5 = pipe(
      DriveLookup.getByPathDocwsroot(npath('/Z/test666/')),
      DriveLookup.usingTempCache,
      execStructure({
        apiUsage: 'fallback',
        cache: structure.cache,
      }),
      M.testCallsTE({ retrieveItemDetailsInFolders: 1 }),
      M.testResTE(res =>
        expect(res).toEqual(
          expect.objectContaining({ valid: false }),
        )
      ),
    )

    return M.allTests(
      test1(req),
      test1(reqChainedTempCached),
      test2(req),
      test2(reqChainedTempCached),
      test3(req),
      test3(reqChainedTempCached),
      test4,
      test5,
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

describe('works with getFoldersTrees', () => {
  const reqGetFolderTrees = (depth: number) =>
    pipe(
      DriveLookup.getFoldersTreesByPathsDocwsroot([
        npath('/test1/'),
      ], depth),
    )

  it('works with getFoldersTrees(onlycache)', () => {
    // test without cache. Missing root is an error
    const test1 = pipe(
      reqGetFolderTrees(0),
      execStructure({ apiUsage: 'onlycache' }),
      M.testErrorIs(MissingRootError.is),
    )

    // works partially cached
    const test2 = pipe(
      reqGetFolderTrees(0),
      execStructure({
        apiUsage: 'onlycache',
        cache: Cache.createWithDetailss([structure.r.d, structure.r.c.test1.d]),
      }),
      M.testCallsTE({ retrieveItemDetailsInFolders: 0 }),
      M.testResTE(res =>
        expect(res).toMatchObject([
          DriveTree.shallowFolder(structure.r.c.test1.d),
        ])
      ),
    )

    // throws error when the cache is not enough
    const test3 = pipe(
      reqGetFolderTrees(1),
      execStructure({
        apiUsage: 'onlycache',
        cache: Cache.createWithDetailss([
          structure.r.d,
          structure.r.c.test1.d,
        ]),
      }),
      M.testError,
    )

    // works when fully cached
    const test4 = pipe(
      reqGetFolderTrees(Infinity),
      execStructure({
        apiUsage: 'onlycache',
        cache: structure.cache,
      }),
      M.testResTE(res => {
        const flat = DriveTree.flattenTreeWithItemsDocwsroot('/')(res[0])
        expect(flat.map(_ => _.path)).toEqual([
          '/test1',
          '/test1/package.json',
          '/test1/test2',
          '/test1/test2/package.json',
          '/test1/test2/test3',
        ])
      }),
    )

    return M.allTests(test1, test2, test3, test4)
  })

  it('works with getFoldersTrees(fallback)', () => {
    const test1 = pipe(
      reqGetFolderTrees(0),
      execStructure({ apiUsage: 'fallback' }),
      M.testCallsTE({
        retrieveItemDetailsInFoldersIds: [
          [structure.r.d.drivewsid],
          [structure.r.c.test1.d.drivewsid],
        ],
      }),
      M.testResTE(res => {
        const flat = pipe(
          res[0],
          DriveTree.flattenTreeWithItemsDocwsroot('/'),
        )

        expect(flat.map(_ => _.path)).toEqual([
          '/test1',
          '/test1/package.json',
          '/test1/test2',
        ])
      }),
    )

    return M.allTests(test1)
  })

  const reqGetFolderTreesChain = (depth1: number, depth2: number) =>
    pipe(
      DriveLookup.getFoldersTreesByPathsDocwsroot([npath('/')], depth1),
      SRTE.bindTo('res1'),
      SRTE.bind('res2', () =>
        DriveLookup.getFoldersTreesByPathsDocwsroot(
          [npath('/test1/')],
          depth2,
        )),
      SRTE.map(({ res1, res2 }) => NA.fromReadonlyNonEmptyArray([res1[0], res2[0]])),
    )

  it('works with getFoldersTrees(fallback) chained', () => {
    const test1 = pipe(
      reqGetFolderTreesChain(1, 0),
      execStructure({ apiUsage: 'fallback' }),
      M.testCallsTE({
        retrieveItemDetailsInFoldersIds: [
          // first call
          [structure.r.d.drivewsid],
          [structure.r.c.test1.d.drivewsid],
        ],
      }),
      M.testResTE(res => {
        const flat0 = pipe(
          res[0],
          DriveTree.flattenTreeWithItemsDocwsroot('/'),
        )

        expect(flat0.map(_ => [_.path, _.item] as const)).toEqual([
          ['/', structure.r.d],
          ['/fileinroot.txt', structure.r.c['fileinroot.txt'].d],
          ['/fileinroot2.txt', structure.r.c['fileinroot2.txt'].d],
          ['/test1', structure.r.c.test1.d],
          ['/test1/package.json', structure.r.c.test1.c['package.json'].d],
          ['/test1/test2', structure.r.c.test1.c.test2.d], // supposed to be shallow details
        ])
      }),
    )

    return M.allTests(test1)
  })
})

describe('works with searchGlobs', () => {
  it('works with searchGlobs', async () => {
    const req = DriveLookup.searchGlobs(['/test1/Z/**'], 1, { goDeeper: true })

    const test1 = pipe(
      req,
      execStructure({
        cache: structure.cache,
        apiUsage: 'fallback',
      }),
      // should try to retrieve the details for the uncached path
      M.testCallsErrorTE({
        retrieveItemDetailsInFolders: 1,
        retrieveItemDetailsInFoldersIds: [
          [structure.r.d.drivewsid, structure.r.c.test1.d.drivewsid],
        ],
      }),
    )

    return M.allTests(test1)
  })
})
