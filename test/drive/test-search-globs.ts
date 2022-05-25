import assert from 'assert'
import { pipe } from 'fp-ts/lib/function'
import * as TE from 'fp-ts/TaskEither'
import { C, DriveLookup } from '../../src/icloud-drive'

import * as L from '../../src/util/logging'
import { executeDrive, fakeicloud } from './util/mocked-api'
import { file, folder } from './util/mocked-drive'

import './debug'

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

  const c = structure.r.c

  const f1 = { path: '/fileinroot.txt', item: c['fileinroot.txt'].d }
  const f2 = { path: '/fileinroot2.txt', item: c['fileinroot2.txt'].d }
  const test1folder = { path: '/test1', item: c['test1'].d }
  const test2folder = { path: '/test1/test2', item: c['test1'].c['test2'].d }
  const package1 = { path: '/test1/package.json', item: c['test1'].c['package.json'].d }
  const package2 = { path: '/test1/test2/package.json', item: c['test1'].c['test2'].c['package.json'].d }

  const run = executeDrive({
    itemByDrivewsid: structure.itemByDrivewsid,
    cache: pipe(
      C.cachef(),
      C.putDetails(structure.r.d),
    ),
  })

  it('basic', async () => {
    return pipe(
      run(pipe(
        DriveLookup.searchGlobs(
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
        ),
        DriveLookup.usingTempCache,
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

        expect(calls().total).toBe(4)
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
