import { pipe } from 'fp-ts/lib/function'
import * as RT from 'fp-ts/lib/ReaderTask'
import * as RTE from 'fp-ts/lib/ReaderTaskEither'
import * as SRTE from 'fp-ts/lib/StateReaderTaskEither'
import * as Task from 'fp-ts/lib/Task'
import * as NA from 'fp-ts/NonEmptyArray'
import * as TE from 'fp-ts/TaskEither'

import * as L from '../../../util/logging'

import { recursiveDirMapper, shallowDirMapper } from '../../../icloud-drive/actions/download/recursiveDirMapper'

import * as DC from '../../../icloud-drive/actions/download/download-conflict'
import { FsStats } from '../../../util/fs'
import { complexStructure0 } from '../fixtures'

L.initLoggers(
  { debug: true },
  [
    L.logger,
    L.cacheLogger,
    L.stderrLogger,
    L.apiLogger,
  ],
)

class Enoent extends Error {
  code = 'ENOENT'
}

describe('lookForConflicts', () => {
  it('works', async () => {
    const fstat = (path: string): TE.TaskEither<Error, FsStats> => TE.left(new Enoent())
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
              remoteitem: [
                '/fileinroot.txt',
                complexStructure0.root.byName['fileinroot.txt'].details,
              ],
              localpath: './output/fileinroot.txt',
            },
          ],
          empties: [],
          localdirstruct: [],
        },
      ),
      Task.map(cfs => {
        expect(cfs.length).toBe(1)
      }),
    )()
  })
})
