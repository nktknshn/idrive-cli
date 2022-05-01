import assert from 'assert'
import { pipe } from 'fp-ts/lib/function'
import * as TE from 'fp-ts/TaskEither'
import { DriveQuery } from '../../src/icloud/drive'
import * as L from '../../src/util/logging'
import { file } from './helpers-drive'
import { executeDrive, fakeicloud } from './struct'

L.initLoggers(
  { debug: true },
  [
    L.logger,
    L.cacheLogger,
    L.stderrLogger,
    L.apiLogger,
  ],
)

describe('searchGlobs', () => {
  it('works', async () => {
    const structure = fakeicloud(
      file({ name: 'fileinroot.txt' }),
    )

    const run = executeDrive({ itemByDrivewsid: structure.itemByDrivewsid })

    const req0 = pipe(
      run(DriveQuery.searchGlobs(['/*.txt', '/**/*.txt'])),
      TE.map(({ calls, res, state }) => {
        expect(res).toStrictEqual(
          [
            [{
              path: '/fileinroot.txt',
              item: structure.root.byName['fileinroot.txt'].details,
            }],
            [{
              path: '/fileinroot.txt',
              item: structure.root.byName['fileinroot.txt'].details,
            }],
          ],
        )
      }),
    )

    assert((await req0())._tag === 'Right')
  })
})
