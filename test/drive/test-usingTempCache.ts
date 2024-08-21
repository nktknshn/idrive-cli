import { pipe } from 'fp-ts/lib/function'
import * as SRTE from 'fp-ts/lib/StateReaderTaskEither'
import * as TE from 'fp-ts/TaskEither'
import { C, DriveLookup } from '../../src/icloud-drive'
import { DetailsDocwsRoot, NonRootDetails } from '../../src/icloud-drive/drive-types'
import { FlattenFolderTreeWPath } from '../../src/icloud-drive/util/drive-folder-tree'
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

describe('usingTempCache', () => {
  const run = executeDrive({
    itemByDrivewsid: structure.itemByDrivewsid,
    cache: pipe(
      C.cachef(),
      C.putDetails(structure.r.d),
    ),
  })

  const req = DriveLookup.getFoldersTreesByPathsFlattenDocwsroot([
    npath('/test1/test2/'),
    npath('/test1/'),
    npath('/test1/test2/test3/'),
  ])

  const check = (
    req: DriveLookup.Effect<
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

        expect(C.getAllDetails(state.cache)).toEqual(
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

  it('nested1', async () => {
    return pipe(
      req,
      DriveLookup.usingTempCache,
      check,
    )
  })

  it('nested2', async () => {
    return pipe(
      DriveLookup.usingTempCache(req),
      DriveLookup.usingTempCache,
      check,
    )
  })

  it('nested3', async () => {
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
      C.cachef(),
      C.putDetails(structure.r.d),
    ),
  })

  it('works1', async () => {
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

  it('works2', async () => {
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
