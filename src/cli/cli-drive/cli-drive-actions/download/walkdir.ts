import * as E from 'fp-ts/lib/Either'
import { pipe } from 'fp-ts/lib/function'
import * as RTE from 'fp-ts/lib/ReaderTaskEither'
import * as TE from 'fp-ts/lib/TaskEither'
import * as TR from 'fp-ts/lib/Tree'
import { Stats } from 'fs'
import { DepFs } from '../../../../icloud/deps/DepFetchClient'
import { stripTrailingSlash } from '../../../../util/normalize-path'
import { Path } from '../../../../util/path'

export type LocalTreeElement =
  | {
    readonly type: 'file'
    path: string
    name: string
    stats: Stats
  }
  | {
    readonly type: 'directory'
    path: string
    name: string
    stats: Stats
  }

export const walkDir = (path: string): RTE.ReaderTaskEither<
  DepFs<'fstat' | 'opendir'>,
  Error,
  TR.Tree<LocalTreeElement>
> =>
  RTE.asksReaderTaskEitherW(({ fs }: DepFs<'fstat' | 'opendir'>) =>
    pipe(
      fs.opendir(path),
      TE.chain(dir =>
        TE.fromTask(
          async () => {
            const items: TR.Forest<LocalTreeElement> = []

            for await (const dirent of dir) {
              const itemPath = Path.join(
                dir.path,
                dirent.name,
              )

              const stats = await fs.fstat(itemPath)()

              if (E.isLeft(stats)) {
                throw stats.left
              }

              if (dirent.isFile()) {
                items.push(TR.make(
                  {
                    type: 'file',
                    path: itemPath,
                    name: dirent.name,
                    stats: stats.right,
                  },
                ))
              }
              else if (dirent.isDirectory()) {
                const dirTree = await walkDir(itemPath)({ fs })()

                if (E.isLeft(dirTree)) {
                  throw dirTree.left
                }

                items.push(dirTree.right)
              }
            }

            const stats = await fs.fstat(dir.path)()
            if (E.isLeft(stats)) {
              throw stats.left
            }

            return TR.make(
              {
                type: 'directory' as const,
                path: dir.path + '/',
                name: Path.basename(dir.path),
                stats: stats.right,
              },
              items,
            )
          },
        )
      ),
      RTE.fromTaskEither,
    )
  )

export const walkDirRel = (
  dstpath: string,
): RTE.ReaderTaskEither<
  DepFs<'fstat' | 'opendir'>,
  Error,
  TR.Tree<LocalTreeElement>
> => {
  const np = stripTrailingSlash(Path.normalize(dstpath))

  return pipe(
    walkDir(np),
    // TE.map(_ => _.forest),
    RTE.map(
      TR.map(
        tree => ({
          ...tree,
          path: tree.path.substring(
            np.length,
          ),
        }),
      ),
    ),
  )
}

export const showLocalTreeElement = (el: LocalTreeElement) => `${el.type} {path: ${el.path}, name: ${el.name}}`
