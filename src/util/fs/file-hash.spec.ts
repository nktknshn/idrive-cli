import assert from 'assert'
import { createReadStream, ReadStream } from 'fs'
import { FileNotFoundError } from '../errors'
import { calculateFileHash, calculateFileHashStream } from './file-hash'

describe('file-hash', () => {
  it('should calculate hash of a file', async () => {
    const stream = ReadStream.from('hello world')

    const res = await calculateFileHashStream(stream)()

    expect(res).toMatchObject({
      _tag: 'Right',
      right: 'b94d27b9934d3e08a52e52d7da7dabfac484efe37a5380ee9088f7ace2efcde9',
    })
  })

  it('handle missing file', async () => {
    const res = await calculateFileHash('missing_file.txt')({
      fs: { createReadStream: createReadStream },
    })()

    assert(res._tag === 'Left')
    expect(res.left).toBeInstanceOf(FileNotFoundError)

    expect(res).toMatchObject({
      _tag: 'Left',
      left: expect.objectContaining({
        message: expect.stringContaining('File not found'),
        path: 'missing_file.txt',
      }),
    })
  })
})
