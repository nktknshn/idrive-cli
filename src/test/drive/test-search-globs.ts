import assert from 'assert'
import { pipe } from 'fp-ts/lib/function'
import * as TE from 'fp-ts/TaskEither'
import { DriveLookup } from '../../icloud-drive'
import * as L from '../../util/logging'
import { file, folder } from './helpers-drive'
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

  const c = structure.root.c

  const f1 = {
    path: '/fileinroot.txt',
    item: c['fileinroot.txt'].details,
  }

  const f2 = {
    path: '/fileinroot2.txt',
    item: c['fileinroot2.txt'].details,
  }

  const test1folder = {
    path: '/test1',
    item: c['test1'].details,
  }

  const test2folder = {
    path: '/test1/test2',
    item: c['test1'].c['test2'].details,
  }

  const package1 = {
    item: c['test1'].c['package.json'].details,
    path: '/test1/package.json',
  }

  const package2 = {
    item: c['test1'].c['test2'].c['package.json'].details,
    path: '/test1/test2/package.json',
  }

  const run = executeDrive({ itemByDrivewsid: structure.itemByDrivewsid })

  it('basic', async () => {
    return pipe(
      run(DriveLookup.searchGlobs(
        [
          '/*.txt',
          '/**/*.txt',
          '/fileinroot.txt',
          'fileinroot.txt',
          '/test1',
          '/**/*.json',
          '/test1/test2',
          '/test1/test2/**/*.exe',
          '/test1/**/*.json',
          '/test1/test2/',
        ],
      )),
      TE.map(({ calls, res, state }) => {
        expect(res).toEqual(
          [
            [f1, f2],
            [f1, f2],
            [f1],
            [],
            [test1folder],
            [package1, package2],
            [test2folder],
            [],
            [package1, package2],
            [],
          ],
        )
      }),
      TE.mapLeft((e) => {
        expect(false).toBe(true)
      }),
    )()
  })

  it('works with options', async () => {
    return pipe(
      run(DriveLookup.searchGlobs(
        [
          '/*.txt',
          '/**/*.txt',
          '/fileinroot.txt',
          'fileinroot.txt',
        ],
        Infinity,
        { contains: true },
      )),
      TE.map(({ calls, res, state }) => {
        expect(res).toEqual(
          [
            [f1, f2],
            [f1, f2],
            [f1],
            [f1],
          ],
        )
      }),
      TE.mapLeft((e) => {
        expect(false).toBe(true)
      }),
    )()
  })
})
