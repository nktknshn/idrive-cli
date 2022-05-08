import * as A from 'fp-ts/lib/Array'
import * as E from 'fp-ts/lib/Either'
import { pipe } from 'fp-ts/lib/function'
import * as RT from 'fp-ts/lib/ReaderTask'
import * as RTE from 'fp-ts/lib/ReaderTaskEither'
import { DepFetchClient, DepFs } from '../../deps-types'
import { loggerIO } from '../loggerIO'
import { printerIO } from '../logging'
import { writeFileFromReadable } from '../writeFileFromReadable'
import { getUrlStream } from './getUrlStream'

export const downloadUrlToFile: DownloadUrlToFile<DepFetchClient & DepFs<'createWriteStream'>> = (
  url: string,
  destpath: string,
) =>
  pipe(
    loggerIO.debug(`getting ${destpath}`),
    RTE.fromIO,
    RTE.chain(() => getUrlStream({ url })),
    RTE.orElseFirst((err) => RTE.fromIO(printerIO.print(`[-] ${err}`))),
    RTE.chainFirstIOK(() => printerIO.print(`writing ${destpath}`)),
    RTE.chainW(writeFileFromReadable(destpath)),
    RTE.orElseFirst((err) => RTE.fromIO(printerIO.print(`[-] ${err}`))),
  )

export const downloadUrlsPar = (
  urlDest: Array<readonly [url: string, localpath: string]>,
): RT.ReaderTask<
  DepFetchClient & DepFs<'createWriteStream'>,
  [E.Either<Error, void>, readonly [string, string]][]
> => {
  return pipe(
    urlDest,
    A.map(([u, d]) => downloadUrlToFile(u, d)),
    A.sequence(RT.ApplicativePar),
    RT.map(A.zip(urlDest)),
  )
}
export type DownloadUrlToFile<R> = (
  url: string,
  destpath: string,
) => RTE.ReaderTaskEither<R, Error, void>