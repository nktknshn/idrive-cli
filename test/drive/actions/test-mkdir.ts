import assert from 'assert'
import { pipe } from 'fp-ts/lib/function'
import * as SRTE from 'fp-ts/lib/StateReaderTaskEither'
import * as TE from 'fp-ts/TaskEither'
import { DriveActions, DriveLookup } from '../../../src/icloud-drive'
import { enableDebug } from '../debug'
import * as Mock from '../util/mocked-drive'

enableDebug(false)

describe('mkdir', () => {
  it('works', async () => {
    const drive = Mock.fakeicloud(
      Mock.folder({ name: '1' })(),
    )

    const req = pipe(
      DriveActions.mkdir({ path: '1/2' }),
      SRTE.bindTo('result'),
      SRTE.bindW('cache', DriveLookup.getCache),
      SRTE.chainW(() => DriveActions.mkdir({ path: '1/2/3' })),
      SRTE.bindTo('result'),
      SRTE.bindW('cache', DriveLookup.getCache),
      SRTE.map(({ cache, result }) => {
        // check that the cache contains the new folder
        // assert.equal(Cache.getByIdO(result[0].drivewsid)(cache)._tag, 'Some')
      }),
      SRTE.chainW(() => DriveActions.mkdir({ path: '1/2/3/4' })),
      Mock.executeDrive(drive),
      TE.map(({ res, calls }) => {
        assert.equal(calls().createFolders, 3)
        assert.equal(calls().retrieveItemDetailsInFolders, 6)
      }),
    )

    const r = await req()

    assert.equal(r._tag, 'Right')
  })
})
