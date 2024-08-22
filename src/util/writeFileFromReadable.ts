import * as TE from 'fp-ts/lib/TaskEither'
import { Readable } from 'stream'
import { DepFs } from '../deps-types/dep-fs'
import { err } from './errors'

export const writeFileFromReadable = (destpath: string) =>
  (readble: Readable): (deps: DepFs<'createWriteStream'>) => TE.TaskEither<Error, void> =>
    deps =>
      TE.tryCatch(
        () => {
          return new Promise(
            (resolve, reject) => {
              const stream = deps.fs.createWriteStream(destpath)
              readble.pipe(stream).on('close', resolve)
            },
          )
        },
        e => err(`error writing file ${destpath}: ${e}`),
      )
