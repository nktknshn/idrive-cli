import assert from 'assert'
import FormData from 'form-data'
import * as A from 'fp-ts/lib/Array'
import * as O from 'fp-ts/lib/Option'
import * as fs from 'fs'
import mime from 'mime-types'
import { TextDecoder } from 'util'
import { normalizePath } from '../src/cli/actions/helpers'
import { parsePath, splitParent } from '../src/icloud/drive/helpers'
import { modifySubset } from '../src/lib/helpers/projectIndexes'

describe('modifySubset', () => {
  it('works', () => {
    assert.deepEqual(
      modifySubset([1, 2, 3, 4, 5], a => a > 3, A.map(v => v + 1)),
      [1, 2, 3, 5, 6],
    )

    assert.deepEqual(
      modifySubset([1, 2, 3, 4, 5, 6, 7], a => a % 2 == 0, A.map(v => v + 1)),
      [1, 3, 3, 5, 5, 7, 7],
    )
  })
})

describe('helpers', () => {
  it('parsePath', () => {
    assert.deepStrictEqual(
      parsePath('/'),
      ['/'],
    )
    assert.deepStrictEqual(
      normalizePath('/'),
      '/',
    )

    assert.deepStrictEqual(
      parsePath('/dir1'),
      ['/', 'dir1'],
    )
    assert.equal(
      normalizePath('/dir1'),
      '/dir1',
    )

    assert.deepStrictEqual(
      parsePath('dir1'),
      ['/', 'dir1'],
    )
    assert.deepStrictEqual(
      normalizePath('dir1'),
      'dir1',
    )

    assert.deepStrictEqual(
      parsePath('dir1/dir2/'),
      ['/', 'dir1', 'dir2'],
    )
    assert.deepStrictEqual(
      normalizePath('dir1/dir2/'),
      'dir1/dir2',
    )

    assert.deepStrictEqual(
      parsePath('/dir1/dir2//'),
      ['/', 'dir1', 'dir2'],
    )
    assert.deepStrictEqual(
      normalizePath('/dir1/dir2//'),
      'dir1/dir2',
    )
  })
})

describe('blah', () => {
  it('getParent', () => {
    assert.deepStrictEqual(
      splitParent('/'),
      O.none,
    )
    assert.deepStrictEqual(
      splitParent(''),
      O.none,
    )
    assert.deepStrictEqual(
      splitParent('/test'),
      O.some(['/', 'test']),
    )
    assert.deepStrictEqual(
      splitParent('/test/test2/test3'),
      O.some(['/test/test2', 'test3']),
    )
  })
})

describe('FormData', () => {
  it('w', () => {
    const form = new FormData()

    form.append('files', fs.readFileSync('package.json'), { filename: 'abcdef.txt' })

    console.log(
      form.getHeaders(),
    )

    console.log(
      new TextDecoder().decode(
        form.getBuffer(),
      ),
    )
  })
})
