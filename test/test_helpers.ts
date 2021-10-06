import assert from "assert"
import { normalizePath, parsePath } from "../src/icloud/drive/helpers"


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