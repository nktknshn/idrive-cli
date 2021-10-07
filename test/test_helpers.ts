import assert from "assert"
import { splitParent, normalizePath, parsePath } from "../src/icloud/drive/helpers"
import * as O from 'fp-ts/lib/Option'


describe('helpers', () => {
    it('parsePath', () => {
        assert.deepStrictEqual(
            parsePath('/'), ['/']
        )
        assert.deepStrictEqual(
            normalizePath('/'), '/'
        )

        assert.deepStrictEqual(
            parsePath('/dir1'), ['/', 'dir1']
        )
        assert.equal(
            normalizePath('/dir1'), '/dir1'
        )

        assert.deepStrictEqual(
            parsePath('dir1'), ['/', 'dir1']
        )
        assert.deepStrictEqual(
            normalizePath('dir1'), '/dir1'
        )


        assert.deepStrictEqual(
            parsePath('dir1/dir2/'), ['/', 'dir1', 'dir2']
        )
        assert.deepStrictEqual(
            normalizePath('dir1/dir2/'), '/dir1/dir2'
        )


        assert.deepStrictEqual(
            parsePath('/dir1/dir2//'), ['/', 'dir1', 'dir2']
        )
        assert.deepStrictEqual(
            normalizePath('/dir1/dir2//'), '/dir1/dir2'
        )

    })

})

describe('blah', () => {
    it('getParent', () => {
        assert.deepStrictEqual(
            splitParent('/'), O.none
        )
        assert.deepStrictEqual(
            splitParent(''), O.none
        )
        assert.deepStrictEqual(
            splitParent('/test'), O.some(['/', 'test'])
        )
        assert.deepStrictEqual(
            splitParent('/test/test2/test3'), O.some(['/test/test2', 'test3'])
        )
    })
})