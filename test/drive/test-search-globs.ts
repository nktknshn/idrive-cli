import { pipe } from 'fp-ts/lib/function'
import * as TE from 'fp-ts/TaskEither'
import micromatch from 'micromatch'
import { Cache, DriveLookup } from '../../src/icloud-drive'
import './debug'
import { enableDebug } from './debug'
import { executeDrive, fakeicloud, file, folder } from './util/mocked-drive'

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

describe('micromatch', () => {
  it('matches paths', () => {
    expect(micromatch.isMatch('a', '**/*')).toBe(true)

    expect(micromatch.isMatch('/test1.txt', '**/*.txt', { strictSlashes: true })).toBe(true)

    expect(micromatch.isMatch('/', '**')).toBe(true)
    expect(micromatch.isMatch('/', '/**')).toBe(true)
    expect(micromatch.isMatch('/', '**/*')).toBe(true)
    expect(micromatch.isMatch('/', '**/*', { strictSlashes: true })).toBe(false)

    expect(micromatch.isMatch('/a.txt', '/*.txt')).toBe(true)

    expect(micromatch.isMatch('/a', '**/*')).toBe(true)
    expect(micromatch.isMatch('/a', '/*')).toBe(true)
    expect(micromatch.isMatch('/a', '/**')).toBe(true)
    expect(micromatch.isMatch('/a/b/c/d', '/**')).toBe(true)
    expect(micromatch.isMatch('/a/b/c/d', '**')).toBe(true)
    expect(micromatch.isMatch('/a/b/c/d', '/*')).toBe(false)

    // huh?
    expect(micromatch.isMatch('/a', '/**/*')).toBe(false)
    expect(micromatch.isMatch('/a/b/c', '**/*')).toBe(true)
    expect(micromatch.isMatch('/a/b/c', '**/c')).toBe(true)

    // huh?
    expect(micromatch.isMatch('/a/b', '/a/**/*')).toBe(true)

    expect(micromatch.isMatch('/a/b', '/**/*')).toBe(true)

    expect(micromatch.isMatch('/a/b', 'a/*')).toBe(false)
    expect(micromatch.isMatch('/a/b', 'a/*', { contains: true })).toBe(true)
  })

  it('extractes bases', () => {
    expect(micromatch.scan('/test.txt*').base).toBe('/')
    expect(micromatch.scan('/test.txt**').base).toBe('/')
    expect(micromatch.scan('/test.txt/**').base).toBe('/test.txt')
    expect(micromatch.scan('/test.txt').base).toBe('/test.txt')
  })

  it('checks scan', () => {
    expect(micromatch.scan('/test.txt*').isGlob).toBe(true)
    expect(micromatch.scan('/test.txt**').isGlob).toBe(true)
    expect(micromatch.scan('/test/').isGlob).toBe(false)

    expect(micromatch.scan('/test/**').isGlob).toBe(true)
    // whaat???
    expect(micromatch.scan('/test/**').isGlobstar).toBe(false)
    expect(micromatch.scan('test/**/*').isGlobstar).toBe(false)
    expect(micromatch.scan('test/**/*.js').isGlobstar).toBe(false)
  })
})

describe('searchGlobs', () => {
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
      Cache.cachef(),
      Cache.putDetails(structure.r.d),
    ),
  })

  it('lists the root with depth 0', async () => {
    return pipe(
      DriveLookup.searchGlobs(['**'], 0, {}),
      executeDrive(structure),
      TE.map(({ calls, res, state }) => {
        // /, fileinroot.txt, fileinroot2.txt, test1/
        expect(res[0].length).toEqual(4)
      }),
    )()
  })

  it('basic', async () => {
    return pipe(
      run(pipe(
        DriveLookup.searchGlobs(
          [
            '*.txt',
            '**/*.txt',
            '/fileinroot.txt',
            'fileinroot.txt',
            '/test1',
            '/**/*.json',
            '/test1/test2',
            '/test1/test2/**/*.exe',
            '/test1/**/*.json',
            '/test1/test2/',
          ],
          Infinity,
          { goDeeper: false },
        ),
        DriveLookup.usingTempCache,
      )),
      TE.map(({ calls, res, state }) => {
        expect(res).toEqual(
          [
            [f1, f2],
            [f1, f2],
            [f1],
            [f1],
            [test1folder],
            [package1, package2],
            [test2folder],
            [],
            [package1, package2],
            [],
          ],
        )

        // expect(calls().total).toBe(4)
      }),
      TE.mapLeft((e) => {
        expect(false).toBe(true)
      }),
    )()
  })
})
