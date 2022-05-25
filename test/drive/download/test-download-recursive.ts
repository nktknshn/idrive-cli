import { pipe } from 'fp-ts/lib/function'
import * as Task from 'fp-ts/lib/Task'
import * as TE from 'fp-ts/TaskEither'

import * as DC from '../../../src/icloud-drive/actions/download/download-conflict'
import { FsStats } from '../../../src/util/fs'
// import { complexStructure0 } from '../fixtures/drive'

import '../debug'
import { fakeicloud, file } from '../util/mocked-drive'

class Enoent extends Error {
  code = 'ENOENT'
}

describe('lookForConflicts', () => {
  it('works', async () => {
    const fstat = (
      path: string,
    ): TE.TaskEither<Error, FsStats> => TE.left(new Enoent())
    // TE.of({
    //   isFile: () => true,
    //   isDirectory: () => false,
    //   size: 10000,
    // })

    return pipe(
      { fs: { fstat } },
      DC.lookForConflicts(
        {
          downloadable: [
            {
              remoteitem: {
                remotepath: '/fileinroot.txt',
                // complexStructure0.r.c['fileinroot.txt'].d,
                remotefile: fakeicloud(
                  file({ name: 'fileinroot.txt' }),
                ).r.c['fileinroot.txt'].d,
              },
              localpath: './output/fileinroot.txt',
            },
          ],
          empties: [],
          localdirstruct: [],
        },
      ),
      Task.map(cfs => {
        expect(cfs.length).toBe(0)
      }),
    )()
  })
})
