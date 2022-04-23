import assert from 'assert'
import * as A from 'fp-ts/Array'
import { flow, pipe } from 'fp-ts/lib/function'
import * as R from 'fp-ts/lib/Record'
import * as SRTE from 'fp-ts/lib/StateReaderTaskEither'
import * as NA from 'fp-ts/NonEmptyArray'
import * as O from 'fp-ts/Option'
import { DepApi, Drive } from '../src/icloud/drive'
import * as C from '../src/icloud/drive/cache/cache'
import { ApiType } from '../src/icloud/drive/deps/api-type'
import { showFolderTree } from '../src/icloud/drive/drive-methods/drive-get-folders-trees'
import { AuthorizedState } from '../src/icloud/drive/requests/request'
import * as T from '../src/icloud/drive/types'
import { rootDrivewsid, trashDrivewsid } from '../src/icloud/drive/types/types-io'
import * as L from '../src/util/logging'
import { normalizePath } from '../src/util/normalize-path'
import { authorizedState } from './fixtures'
import { appLibrary, createDetails, docwsrootG, file, folder } from './helpers-drive'

import * as TE from 'fp-ts/TaskEither'
import { invalidPath, validPath } from '../src/icloud/drive/cache/cache-get-by-path-types'
import { err } from '../src/util/errors'
const struct = flow(docwsrootG, createDetails)

const retrieveItemDetailsInFolders = (
  detailsRec: Record<string, T.DetailsOrFile<T.DetailsDocwsRoot>>,
): ApiType['retrieveItemDetailsInFolders'] =>
  ({ drivewsids }) => {
    return SRTE.of(pipe(
      drivewsids,
      NA.map(did => R.lookup(did)(detailsRec)),
      NA.map(O.foldW(
        () => T.invalidId,
        d => d.type === 'FILE' ? T.invalidId : d,
      )),
    ))
  }

const complexStructure0 = struct(
  folder({ name: 'test1' })(),
  folder({ name: 'test2' })(
    file({ name: 'file1.txt', docwsid: 'file1' }),
    file({ name: 'file2.txt' }),
  ),
  folder({ name: 'test3' })(),
  appLibrary({
    name: 'Obsidian',
    docwsid: 'documents',
    zone: 'iCloud.md.obsidian',
  })(
    folder({ name: 'my1' })(
      file({ name: 'note1.md' }),
      file({ name: 'note2.md' }),
      folder({ name: 'bookmarks' })(
        file({ name: 'index.md' }),
      ),
      folder({ name: 'misc', tag: 'misc' })(
        folder({ name: 'js' })(
          file({ name: 'index.js' }),
          file({ name: 'abcdef.json' }),
          file({ name: 'nested.txt' }),
        ),
        folder({ name: 'images' })(
          folder({ name: 'backup' })(),
          file({ name: 'image1.png' }),
          file({ name: 'image2.png' }),
          file({ name: 'image3.png' }),
        ),
      ),
    ),
  ),
  file({ name: 'fileinroot.txt', tag: 'fileinroot.txt' }),
)
// complexStructure0.aa.Obsidian.children.my1.children.misc.children.images

L.initLoggers(
  { debug: true },
  [
    L.logger,
    L.cacheLogger,
    L.stderrLogger,
    L.apiLogger,
  ],
)

const createState = ({
  cache = C.cachef(),
}) => ({ ...authorizedState, cache })

type Calls = {
  calls: () => {
    retrieveItemDetailsInFolders: number
    total: number
  }
}

const createEnv = (
  details: Record<string, T.DetailsOrFile<T.DetailsDocwsRoot>>,
): Calls & DepApi<'retrieveItemDetailsInFolders'> => {
  let calls = {
    retrieveItemDetailsInFolders: 0,
    total: 0,
  }
  return {
    calls: () => calls,
    api: {
      retrieveItemDetailsInFolders: (args) => {
        calls.retrieveItemDetailsInFolders += 1
        calls.total += 1
        L.apiLogger.debug(`retrieveItemDetailsInFolders(${JSON.stringify(args)})`)

        return pipe(
          // SRTE.fromIO(() =>)),
          retrieveItemDetailsInFolders(details)(args),
        )
      },
    },
  }
}

const executeDrive = ({
  details,
  cache = C.cachef(),
}: {
  details: Record<string, T.DetailsOrFile<T.DetailsDocwsRoot>>
  cache?: C.Cache
}): <A>(m: Drive.Effect<A>) => TE.TaskEither<Error, { res: A; state: Drive.State } & Calls> => {
  const state = createState({ cache })
  const env = createEnv(details)

  return m =>
    pipe(
      m(state)(env),
      TE.map(a => ({ res: a[0], state: a[1], calls: env.calls })),
    )
}

describe('retrieveItemDetailsInFoldersSaving', () => {
  it('works', async () => {
    const state = createState({})
    const env = createEnv(complexStructure0.details)
    const req = pipe(
      Drive.getByPathDocwsRoot(
        normalizePath('/test2/file1.txt'),
      ),
    )

    const res1 = await req(state)(env)()

    assert(res1._tag === 'Right')

    assert(res1.right[0].valid)
    assert(res1.right[0].file._tag === 'Some')

    assert.deepEqual(
      res1.right[0].file.value,
      complexStructure0.root.children[1].children[0].details,
    )
  })

  it('searchGlobs', async () => {
    const req0 = pipe(
      Drive.searchGlobs(['/*.txt']),
      executeDrive({ details: complexStructure0.details }),
      TE.map(({ calls, res, state }) => {
        assert.deepEqual(
          res,
          [[{
            path: '/fileinroot.txt',
            item: complexStructure0.byTag['fileinroot.txt'].details,
          }]],
        )
      }),
    )

    assert((await req0())._tag === 'Right')
  })

  it('getFoldersTrees', async () => {
    const { details, root: tree } = struct(
      file({ name: 'file1.txt' }),
      folder({ name: 'test1' })(
        file({ name: 'file2.txt' }),
      ),
    )

    const env = createEnv(details)
    const cache = pipe(
      C.cachef(),
      C.putDetails(tree.details),
    )

    assert(cache._tag === 'Right')

    const state = createState({ cache: cache.right })

    const req0 = pipe(
      Drive.chainCachedDocwsRoot(root =>
        Drive.getFoldersTrees([
          root,
          root,
          root,
        ], Infinity)
      ),
      SRTE.map(NA.map(showFolderTree)),
    )

    console.log(
      await req0(state)(env)(),
    )
  })
})

describe('getByPaths', () => {
  it('gets', async () => {
    const req0 = pipe(
      Drive.getByPathsDocwsroot([normalizePath('/')]),
      executeDrive({ details: complexStructure0.details }),
      TE.map(({ calls, res, state }) => {
        assert.deepEqual(
          res,
          [validPath([complexStructure0.root.details])],
        )
      }),
    )

    assert((await req0())._tag === 'Right')
  })

  it('gets2', async () => {
    const req0 = pipe(
      Drive.getByPathsDocwsroot([
        normalizePath('/Obsidian/my1/misc'),
        normalizePath('/Obsidian/my1/mi'),
      ]),
      executeDrive({ details: complexStructure0.details }),
      TE.map(({ calls, res, state }) => {
        expect(res).toEqual(
          [
            validPath([
              complexStructure0.root.details,
              complexStructure0.root.byName.Obsidian.details,
              complexStructure0.root.byName.Obsidian.byName.my1.details,
              complexStructure0.root.byName.Obsidian.byName.my1.byName.misc.details,
            ]),
            invalidPath(
              [
                complexStructure0.root.details,
                complexStructure0.root.byName.Obsidian.details,
                complexStructure0.root.byName.Obsidian.byName.my1.details,
              ],
              ['mi'],
              expect.any(Error),
            ),
          ],
        )
      }),
    )

    assert((await req0())._tag === 'Right')

    // console.log(
    //   await req0(),
    // )
  })
})
