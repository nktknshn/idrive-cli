import assert from 'assert'
import { flow, pipe } from 'fp-ts/lib/function'
import * as R from 'fp-ts/lib/Record'
import * as SRTE from 'fp-ts/lib/StateReaderTaskEither'
import * as NA from 'fp-ts/NonEmptyArray'
import * as O from 'fp-ts/Option'
import * as TE from 'fp-ts/TaskEither'
import { DepApi, Drive } from '../../src/icloud/drive'
import * as C from '../../src/icloud/drive/cache/cache'
import { invalidPath, validPath } from '../../src/icloud/drive/cache/cache-get-by-path-types'
import { ApiType } from '../../src/icloud/drive/deps/api-type'
import { showFolderTree } from '../../src/icloud/drive/drive-methods/drive-get-folders-trees'
import { NotFoundError } from '../../src/icloud/drive/errors'
import * as T from '../../src/icloud/drive/types'
import * as L from '../../src/util/logging'
import { normalizePath, npath } from '../../src/util/normalize-path'
import { authorizedState } from '../fixtures'
import { appLibrary, createRootDetails, docwsroot, file, folder } from './helpers-drive'
import { executeDrive, struct } from './struct'

L.initLoggers(
  { debug: true },
  [
    L.logger,
    L.cacheLogger,
    L.stderrLogger,
    L.apiLogger,
  ],
)

describe('searchGlobs', () => {
  it('works', async () => {
    const structure = struct(
      file({ name: 'fileinroot.txt' }),
    )

    const req0 = pipe(
      Drive.searchGlobs(['/*.txt', '/**/*.txt']),
      executeDrive({ itemByDrivewsid: structure.itemByDrivewsid }),
      TE.map(({ calls, res, state }) => {
        expect(res).toStrictEqual(
          [
            [{
              path: '/fileinroot.txt',
              item: structure.root.byName['fileinroot.txt'].details,
            }],
            [{
              path: '/fileinroot.txt',
              item: structure.root.byName['fileinroot.txt'].details,
            }],
          ],
        )
      }),
    )

    assert((await req0())._tag === 'Right')
  })
})
