import { assert } from 'console'
import * as E from 'fp-ts/lib/Either'
import { pipe } from 'fp-ts/lib/function'
import * as T from 'fp-ts/lib/Task'
import * as TE from 'fp-ts/lib/TaskEither'
import * as TR from 'fp-ts/lib/Tree'
import { Dir } from 'fs'
import fs from 'fs/promises'
import { string } from 'yargs'
import { hideBin } from 'yargs/helpers'
import yargs from 'yargs/yargs'
import { err } from './lib/errors'
import { Path } from './lib/util'

const walk = async (path: string) => {
  const readDir = (dir: Dir) =>
    TE.tryCatch(
      async () => {
        let items = []
        for await (const dirent of dir) {
          items.push(dirent)
        }

        return items
      },
      reason => err(`error reading dir ${reason}`),
    )

  const items = await pipe(
    TE.Do,
    TE.bind('dir', () => opendir(path)),
    TE.bind('items', ({ dir }) => readDir(dir)),
    TE.map(_ => _.items),
    // TE.chainFirst(({ dir }) => TE.fromTask(() => dir.close())),
  )()

  return items
}

type TreeElement =
  | {
    readonly type: 'file'
    path: string
    name: string
  }
  | {
    readonly type: 'directory'
    path: string
    name: string
  }

const opendir = (path: string) =>
  TE.tryCatch(
    () => fs.opendir(path),
    reason => err(`cant open dir ${reason}`),
  )

const walkDir = (path: string): TE.TaskEither<Error, TR.Tree<TreeElement>> =>
  pipe(
    opendir(path),
    TE.chain(dir =>
      TE.fromTask(
        async () => {
          let items: TR.Forest<TreeElement> = []

          for await (const dirent of dir) {
            const itemPath = Path.join(
              dir.path,
              dirent.name,
            )

            if (dirent.isFile()) {
              items.push(TR.make(
                {
                  type: 'file',
                  path: itemPath,
                  name: dirent.name,
                },
              ))
            }
            else if (dirent.isDirectory()) {
              const dirTree = await walkDir(itemPath)()

              if (E.isLeft(dirTree)) {
                throw dirTree.left
              }

              items.push(dirTree.right)
            }
          }

          return TR.make(
            {
              type: 'directory' as const,
              path: dir.path,
              name: Path.basename(dir.path),
            },
            items,
          )
        },
      )
    ),
  )

import child_process from 'child_process'
import micromatch from 'micromatch'

async function main() {
  // yargs(hideBin(process.argv))
  //   .positional('<path>', { type: string, demandOption: true })
  //   .help()

  console.log(
    micromatch.scan('/**/*.js'),
  )

  // const p = () =>
  //   new Promise(
  //     (resolve, reject) => {
  //       child_process
  //         .spawn(`vim`, ['/tmp/idrive_edit.txt'], {
  //           // shell: true,
  //           stdio: 'inherit',
  //         })
  //         .on('close', (code, signal) => {
  //           if (code === 0) {
  //             return resolve(signal)
  //           }
  //           return reject(code)
  //         })
  //     },
  //   )

  // await pipe(
  //   p,
  // )()
  // const path = process.argv[2]
  // assert(path)
  // console.log(path)

  // const tree = await pipe(
  //   walkDir(path),
  //   TE.map(TR.map(_ => `${_.path}`)),
  //   TE.map(TR.drawTree),
  // )()

  // if (E.isLeft(tree)) {
  //   console.error(
  //     tree.left,
  //   )
  //   return 1
  // }

  // console.log(
  //   tree.right,
  // )
}

main()
