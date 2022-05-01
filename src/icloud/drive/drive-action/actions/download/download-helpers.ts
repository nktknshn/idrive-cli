import * as A from 'fp-ts/lib/Array'
import * as E from 'fp-ts/lib/Either'
import { constVoid, flow, identity, pipe } from 'fp-ts/lib/function'
// import { fstat, mkdir as mkdirTask, writeFile } from '../../../../lib/fs'
import * as RT from 'fp-ts/lib/ReaderTask'
import * as RTE from 'fp-ts/lib/ReaderTaskEither'
import { Eq } from 'fp-ts/lib/string'
import * as TE from 'fp-ts/lib/TaskEither'
import { Readable } from 'stream'
import { DepFetchClient, DepFs } from '../../../../../icloud/deps'
import { getUrlStream } from '../../../../../icloud/deps/getUrlStream'
import { err } from '../../../../../util/errors'
import { loggerIO } from '../../../../../util/loggerIO'
import { printerIO } from '../../../../../util/logging'
import { Path, prependPath, stripTrailingSlash } from '../../../../../util/path'
import { hasOwnProperty } from '../../../../../util/util'
import { ConflictsSolver, handleLocalFilesConflicts } from './download-conflict'
import {
  DownloadTask,
  DownloadTaskLocalMapping,
  DownloadUrlToFile,
  // FilterTreeResult,
} from './types'

export const createDirStruct = (
  dirs: string[],
): RTE.ReaderTaskEither<DepFs<'mkdir'>, Error, void> =>
  ({ fs: { mkdir: mkdirTask } }) => {
    const mkdir = flow(
      mkdirTask,
      TE.orElseW(e =>
        isEexistError(e)
          ? TE.of(constVoid())
          : TE.left(e)
      ),
    )

    return pipe(
      pipe(dirs, A.map(mkdir)),
      TE.sequenceSeqArray,
      TE.map(constVoid),
    )
  }

export const getDirectoryStructure = (paths: string[]) => {
  const parseDown = (path: string) => {
    const result = []

    while (path !== '/') {
      result.push(path)
      path = Path.parse(path).dir
    }

    return A.reverse(result)
  }

  return pipe(
    paths,
    A.map(Path.parse),
    A.zip(paths),
    A.map(([_, p]) => p.endsWith('/') ? stripTrailingSlash(p) : _.dir),
    A.map(parseDown),
    A.flatten,
    A.uniq<string>(Eq),
  )
}

export const recursiveDirMapper = (
  dstpath: string,
  mapPath: (path: string) => string = identity,
) =>
  (ds: DownloadTask): DownloadTaskLocalMapping => {
    return {
      downloadable: ds.downloadable
        .map(([remotepath, file]) => ({
          info: [remotepath, file],
          localpath: prependPath(dstpath)(mapPath(remotepath)),
        })),
      empties: ds.empties
        .map(([remotepath, file]) => ({
          info: [remotepath, file],
          localpath: prependPath(dstpath)(mapPath(remotepath)),
        })),
      localdirstruct: [
        dstpath,
        ...ds.dirstruct
          .map(p => prependPath(dstpath)(mapPath(p))),
      ],
    }
  }

export const downloadTaskMapper = <SolverDeps>(
  deps: {
    conflictsSolver: ConflictsSolver<SolverDeps>
    toDirMapper: (ds: DownloadTask) => DownloadTaskLocalMapping
  },
) =>
  (ds: DownloadTask): RTE.ReaderTaskEither<
    DepFs<'fstat'> & SolverDeps,
    Error,
    DownloadTaskLocalMapping & { initialTask: DownloadTaskLocalMapping }
  > => {
    return pipe(
      deps.toDirMapper(ds),
      handleLocalFilesConflicts({
        // conflictsSolver: resolveConflictsRename,
        // conflictsSolver: solvers.resolveConflictsOverwrightIfSizeDifferent(
        //   file => file.extension === 'band' && file.zone.endsWith('mobilegarageband'),
        // ),
        conflictsSolver: deps.conflictsSolver,
        //  solvers.resolveConflictsAskEvery,
      }),
    )
  }

const createEmptyFiles = (paths: string[]): RTE.ReaderTaskEither<DepFs<'writeFile'>, Error, unknown[]> => {
  return ({ fs: { writeFile } }) =>
    pipe(
      paths,
      A.map(path => writeFile(path, '')),
      A.sequence(TE.ApplicativePar),
    )
}

export const createEmpties = (
  { empties }: DownloadTaskLocalMapping,
): RTE.ReaderTaskEither<DepFs<'writeFile'>, Error, void> =>
  pipe(
    empties.length > 0
      ? pipe(
        RTE.ask<DepFs<'writeFile'>>(),
        RTE.chainFirstIOK(() => loggerIO.debug(`creating empty ${empties.length} files`)),
        RTE.chainW(({ fs: { writeFile } }) =>
          pipe(
            empties.map(_ => _.localpath),
            A.map(path => writeFile(path, '')),
            A.sequence(TE.ApplicativePar),
            RTE.fromTaskEither,
          )
        ),
        RTE.map(constVoid),
      )
      : RTE.of(constVoid()),
  )

const isEnoentError = (e: Error) => hasOwnProperty(e, 'code') && e.code === 'ENOENT'

const isEexistError = (e: Error) => hasOwnProperty(e, 'code') && e.code === 'EEXIST'
