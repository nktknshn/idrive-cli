import { pipe } from 'fp-ts/lib/function'
import * as O from 'fp-ts/Option'
import * as TE from 'fp-ts/TaskEither'
import { Cache, DriveLookup } from '../../src/icloud-drive'
import * as M from './util/mocked-drive'

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

  it('works with retrieveItemDetailsInFoldersCached(onlycache)', () => {
    const test1 = pipe(
      req,
      execStructure({ apiUsage: 'onlycache' }),
      M.testCallsTE({ retrieveItemDetailsInFolders: 0 }),
      M.testResTE(_ => _.toEqual([O.none])),
    )()

    const test2 = pipe(
      req,
      execStructure({
        apiUsage: 'onlycache',
        cache: structure.cache,
      }),
      M.testCallsTE({ retrieveItemDetailsInFolders: 0 }),
      M.testResTE(_ => _.toEqual([O.some(structure.r.c.test1.d)])),
    )()

    return Promise.all([test1, test2])
  })

  it('works with retrieveItemDetailsInFoldersCached(fallback/always)', () => {
    const test1 = pipe(
      req,
      execStructure({ apiUsage: 'fallback' }),
      M.testCallsTE({ retrieveItemDetailsInFolders: 1 }),
      M.testResTE(_ => _.toEqual([O.some(structure.r.c.test1.d)])),
    )()

    const test2 = pipe(
      req,
      M.executeDrive({
        itemByDrivewsid: structure.itemByDrivewsid,
        apiUsage: 'fallback',
        cache: structure.cache,
      }),
      M.testCallsTE({ retrieveItemDetailsInFolders: 0 }),
      M.testResTE(_ => _.toEqual([O.some(structure.r.c.test1.d)])),
    )()

    const test3 = pipe(
      req,
      execStructure({ apiUsage: 'always' }),
      M.testCallsTE({ retrieveItemDetailsInFolders: 1 }),
      M.testResTE(_ => _.toEqual([O.some(structure.r.c.test1.d)])),
    )()

    const test4 = pipe(
      req,
      execStructure({ apiUsage: 'always', cache: structure.cache }),
      M.testCallsTE({ retrieveItemDetailsInFolders: 0 }),
      M.testResTE(_ => _.toEqual([O.some(structure.r.c.test1.d)])),
    )()

    return Promise.all([test1, test2, test3, test4])
  })
})
