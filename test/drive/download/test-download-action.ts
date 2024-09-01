import { pipe } from 'fp-ts/lib/function'
import * as Task from 'fp-ts/lib/Task'
import * as TE from 'fp-ts/TaskEither'

import * as DC from '../../../src/icloud-drive/drive-actions/download/download-conflict'
import { FsStats } from '../../../src/util/fs'
import { enableDebug } from '../debug'
import { complexStructure0 } from '../fixtures/drive'

enableDebug(false)

class Enoent extends Error {
  code = 'ENOENT'
}

describe('lookForConflicts', () => {
  it('works', async () => {
    const fstatNoent = (): TE.TaskEither<Error, FsStats> => TE.left(new Enoent())

    return pipe(
      { fs: { fstat: fstatNoent } },
      DC.lookForLocalConflicts(
        {
          downloadable: [
            {
              item: {
                remotepath: '/fileinroot.txt',
                remotefile: complexStructure0.r.c['fileinroot.txt'].d,
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
