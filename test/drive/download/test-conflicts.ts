import assert from 'assert'
import { constant, pipe } from 'fp-ts/lib/function'
import * as Task from 'fp-ts/lib/Task'
import * as TE from 'fp-ts/TaskEither'
import * as DC from '../../../src/icloud-drive/drive-actions/download/download-conflict'
import { FsStats } from '../../../src/util/fs'
import { isDefined } from '../../../src/util/guards'
import { enableDebug } from '../debug'
import { fakeicloud, file, folder } from '../util/mocked-drive'

enableDebug(false)

class Enoent extends Error {
  code = 'ENOENT'
}

describe('lookForConflicts', () => {
  const s = fakeicloud(
    file({ name: 'fileinroot.txt' }),
    folder({ name: 'folder1' })(
      file({ name: 'file1.txt' }),
      file({ name: 'file2.txt' }),
      file({ name: 'file3.txt' }),
    ),
  )

  const c = s.r.c

  it('works', async () => {
    const fstat = (
      path: string,
    ): TE.TaskEither<Error, FsStats> => {
      const res = {
        './output/fileinroot.txt': TE.left(new Enoent()),
        './output/folder1/file1.txt': TE.left(new Error()),
        './output/folder1/file2.txt': TE.right({
          isFile: constant(true),
          isDirectory: constant(false),
          size: 0,
        } as FsStats),
      }[path]

      assert(isDefined(res))
      return res
    }

    const item0 = {
      item: {
        remotepath: '/fileinroot.txt',
        remotefile: c['fileinroot.txt'].d,
      },
      localpath: './output/fileinroot.txt',
    }

    const item1 = {
      item: {
        remotepath: '/folder1/file1.txt',
        remotefile: c.folder1.c['file1.txt'].d,
      },
      localpath: './output/folder1/file1.txt',
    }

    const item2 = {
      item: {
        remotepath: '/folder1/file2.txt',
        remotefile: c.folder1.c['file2.txt'].d,
      },
      localpath: './output/folder1/file2.txt',
    }

    return pipe(
      { fs: { fstat } },
      DC.lookForLocalConflicts(
        {
          downloadable: [item0, item1],
          empties: [item2],
          localdirstruct: [],
        },
      ),
      Task.map(cfs => {
        expect(cfs).toEqual([
          {
            tag: 'statserror',
            item: item1,
            error: expect.any(Error),
          },
          {
            tag: 'exists',
            item: item2,
            localitem: {
              type: 'file',
              path: './output/folder1/file2.txt',
              name: 'file2.txt',
              stats: expect.objectContaining({
                size: 0,
              }),
            },
          },
        ])
      }),
    )()
  })
})
