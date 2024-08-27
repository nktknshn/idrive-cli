import * as RTE from 'fp-ts/lib/ReaderTaskEither'
import * as TE from 'fp-ts/lib/TaskEither'
import { Readable } from 'stream'
import { DepFs } from '../../deps-types/dep-fs'
import { err } from '../errors'

export const writeFileFromReadable = (destpath: string) =>
  (readble: Readable): RTE.ReaderTaskEither<DepFs<'createWriteStream'>, Error, void> =>
    ({ fs }) =>
      TE.tryCatch(
        () => {
          return new Promise(
            (resolve, reject) => {
              const stream = fs.createWriteStream(destpath)
              readble.pipe(stream).on('close', resolve)
            },
          )
        },
        e => err(`error writing file ${destpath}: ${e}`),
      )
