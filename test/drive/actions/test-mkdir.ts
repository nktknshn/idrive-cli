import assert from 'assert'
import { constVoid, flow, pipe } from 'fp-ts/lib/function'
import * as SRTE from 'fp-ts/lib/StateReaderTaskEither'
import * as TE from 'fp-ts/TaskEither'
import { Cache, DriveActions, DriveLookup } from '../../../src/icloud-drive'
import { logger } from '../../../src/logging'
import { loggerIO } from '../../../src/logging/loggerIO'
import { err } from '../../../src/util/errors'
import * as SrteUtils from '../../../src/util/srte-utils'
import { enableDebug } from '../debug'
import * as Mock from '../util/mocked-drive'

enableDebug(true)

describe('mkdir', () => {
  it('works', async () => {
    const drive = Mock.fakeicloud(
      Mock.folder({ name: '1' })(),
    )

    type A = SRTE.StateReaderTaskEither<{ a: number }, unknown, unknown, number>

    const a = pipe(
      SRTE.left(err('error')),
      SrteUtils.orElseW(() => SRTE.right(constVoid())),
    )

    const b = await a({ a: 0 })({})()

    assert.equal(b._tag, 'Right')

    // const a = pipe(
    //   TE.left(err('error')),
    //   TE.orElseFirstW(() => TE.right(constVoid())),
    // )

    // const b = await a()

    // assert.equal(b._tag, 'Right')

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

    console.log(r)
    assert.equal(r._tag, 'Right')
  })
})
