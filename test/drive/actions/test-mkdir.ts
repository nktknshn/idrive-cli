import assert from 'assert'
import { pipe } from 'fp-ts/lib/function'
import * as SRTE from 'fp-ts/lib/StateReaderTaskEither'
import * as TE from 'fp-ts/TaskEither'
import { Cache, DriveActions, DriveLookup } from '../../../src/icloud-drive'
import { logger } from '../../../src/logging'
import { enableDebug } from '../debug'
import * as Mock from '../util/mocked-drive'

enableDebug(true)

describe('mkdir', () => {
  it('works', async () => {
    const drive = Mock.fakeicloud(
      Mock.folder({ name: '1' })(),
    )

    const req = pipe(
      DriveLookup.getCache(),
      SRTE.chainW(cache => {
        logger.debug(Cache.drawTree(cache))
        return DriveActions.mkdir({ path: '1/2' })
      }),
      SRTE.bindTo('result'),
      SRTE.bindW('cache', DriveLookup.getCache),
      SRTE.map(({ cache, result }) => {
        logger.debug(Cache.drawTree(cache))
        // check that the cache contains the new folder
        // assert.equal(Cache.getByIdO(result[0].drivewsid)(cache)._tag, 'Some')
      }),
      SRTE.chainW(() => DriveActions.mkdir({ path: '1/2/3' })),
      SRTE.bindTo('result'),
      SRTE.bindW('cache', DriveLookup.getCache),
      SRTE.map(({ cache, result }) => {
        // check that the cache contains the new folder
        logger.debug(Cache.drawTree(cache))
        // assert.equal(Cache.getByIdO(result[0].drivewsid)(cache)._tag, 'Some')
      }),
      SRTE.chainW(() => DriveActions.mkdir({ path: '1/2/3/4' })),
      SRTE.chainW(() =>
        pipe(
          DriveLookup.getCache(),
          SRTE.map((cache) => logger.debug(Cache.drawTree(cache))),
        )
      ),
      Mock.executeDrive(drive),
      TE.map(({ res, calls }) => {
        assert.equal(calls().createFolders, 3)
      }),
    )

    const r = await req()

    console.log(r)
    assert.equal(r._tag, 'Right')
  })
})
