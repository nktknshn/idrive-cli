import * as crypto from 'crypto'
import * as E from 'fp-ts/Either'
import { flow, pipe } from 'fp-ts/lib/function'
import * as RTE from 'fp-ts/lib/ReaderTaskEither'
import * as TE from 'fp-ts/lib/TaskEither'
import * as O from 'fp-ts/Option'
import { Readable } from 'stream'
import { DepFs } from '../../deps-types'
import { ensureError, FileNotFoundError } from '../errors'
import { isEnoentError } from './is-enoent-error'

type Deps = DepFs<'createReadStream'>

/** Calculates the hash of a file. Returns `None` if the file does not exist. */
export const calculateFileHashO = (fpath: string): RTE.ReaderTaskEither<Deps, Error, O.Option<string>> =>
  pipe(
    calculateFileHash(fpath),
    RTE.fold((e) =>
      FileNotFoundError.is(e)
        ? RTE.of(O.none)
        : RTE.left(e), hash => RTE.of(O.some(hash))),
  )

export const calculateFileHash = (fpath: string): RTE.ReaderTaskEither<Deps, Error, string> =>
  ({ fs }) =>
    pipe(
      E.tryCatch(
        () => fs.createReadStream(fpath),
        flow(ensureError, e => isEnoentError(e) ? FileNotFoundError.create(e.path) : e),
      ),
      TE.fromEither,
      TE.chain(calculateFileHashStream),
    )

export const calculateFileHashStream = (stream: Readable): TE.TaskEither<
  Error,
  string
> =>
  TE.tryCatch(
    () => {
      return new Promise((resolve, reject) => {
        const hash = crypto.createHash('sha256')
        stream.on('data', data => hash.update(data))
        stream.on('end', () => resolve(hash.digest('hex')))
        stream.on('error', reject)
      })
    },
    flow(ensureError, e => isEnoentError(e) ? FileNotFoundError.create(e.path) : e),
  )
