import * as A from 'fp-ts/lib/Array'
import { flow, pipe } from 'fp-ts/lib/function'
import * as NA from 'fp-ts/lib/NonEmptyArray'
import * as RTE from 'fp-ts/lib/ReaderTaskEither'
import * as SRTE from 'fp-ts/lib/StateReaderTaskEither'
import * as TE from 'fp-ts/lib/TaskEither'
import * as fs from 'fs/promises'
import { err } from '../../../lib/errors'
import { NEA, XXX } from '../../../lib/types'
import { Path } from '../../../lib/util'
import { AuthorizedState, AuthorizeEnv } from '../../authorization/authorize'
import { getMissedFound } from '../helpers'
import * as T from '../requests/types/types'
import * as API from './type'

import { apply } from 'fp-ts/function'
import * as R from 'fp-ts/lib/Reader'
import { Stats } from 'fs'
import mime from 'mime-types'
import { Readable } from 'stream'
import { expectResponse } from '../../../lib/http/fetch-client'
import { authLogger } from '../../../lib/logging'
import { AccountLoginResponseBody } from '../../authorization/types'
import { getUrlStream as getUrlStream_ } from '../requests/download'
import { BasicState } from '../requests/request'

const useRequest = <R>() =>
  <Args extends unknown[], S extends AuthorizedState, R1 extends R, A>(
    f: (r: R) => (...args: Args) => SRTE.StateReaderTaskEither<S, R1, Error, A>,
  ) =>
    (...args: Args) =>
      pipe(
        SRTE.ask<S, R>(),
        SRTE.map(f),
        SRTE.chain(f => f(...args)),
      )

/** basic api functions as exported functions*/

export const renameItems = flow(
  useRequest<API.Use<'renameItems'>>()(_ => _.renameItems),
)

export const moveItems = flow(
  useRequest<API.Use<'moveItems'>>()(_ => _.moveItems),
)

export const moveItemsToTrash = flow(
  useRequest<API.Use<'moveItemsToTrash'>>()(_ => _.moveItemsToTrash),
)

export const retrieveItemDetailsInFolders = flow(
  useRequest<API.Use<'retrieveItemDetailsInFolders'>>()(_ => _.retrieveItemDetailsInFolders),
)

export const download = flow(
  useRequest<API.Use<'download'>>()(_ => _.download),
)

export const downloadBatch = flow(
  useRequest<API.Use<'downloadBatch'>>()(_ => _.downloadBatch),
)

export const createFolders = flow(
  useRequest<API.Use<'createFolders'>>()(_ => _.createFolders),
)

export const authorizeSessionM = <S extends BasicState>(): XXX<
  S,
  API.Use<'authorizeSession'>,
  AccountLoginResponseBody
> =>
  pipe(
    SRTE.asksStateReaderTaskEitherW((_: API.Use<'authorizeSession'>) => _.authorizeSession<S>()),
  )

/** higher level methods based and dependent on basic functions */

export const authorizeStateM3 = <
  S extends BasicState,
>(state: S): RTE.ReaderTaskEither<API.Use<'authorizeSession'>, Error, S & { accountData: AccountLoginResponseBody }> =>
  pipe(
    authorizeSessionM<S>()(state),
    RTE.map(([accountData, state]) => ({ ...state, accountData })),
  )

export const getUrlStream = ({ url }: {
  url: string
}): RTE.ReaderTaskEither<API.Use<'fetchClient'>, Error, Readable> =>
  pipe(
    RTE.ask<API.Use<'fetchClient'>>(),
    RTE.chainTaskEitherK(flow(getUrlStream_, apply({ url }))),
  )

export const retrieveItemDetailsInFoldersS = <S extends AuthorizedState>(
  drivewsids: NEA<string>,
): XXX<
  S,
  API.Use<'retrieveItemDetailsInFolders'>,
  { missed: string[]; found: (T.DetailsDocwsRoot | T.DetailsTrash | T.DetailsFolder | T.DetailsAppLibrary)[] }
> =>
  pipe(
    retrieveItemDetailsInFolders<S>({ drivewsids }),
    SRTE.map(ds => getMissedFound(drivewsids, ds)),
  )

export const retrieveItemDetailsInFolder = (drivewsid: string) =>
  pipe(
    retrieveItemDetailsInFolders({ drivewsids: [drivewsid] }),
    SRTE.map(
      NA.head,
    ),
  )

export const getItemUrl = flow(
  download,
  SRTE.map(
    _ => _.data_token?.url ?? _.package_token?.url,
  ),
)

export type UploadMethodDeps =
  & API.Use<'upload'>
  & API.Use<'singleFileUpload'>
  & API.Use<'updateDocuments'>

export const upload = flow(
  useRequest<UploadMethodDeps>()(deps =>
    <S extends AuthorizedState>(
      { sourceFilePath, docwsid, fname, zone }: {
        zone: string
        sourceFilePath: string
        docwsid: string
        fname?: string
      },
    ) => {
      const parsedSource = fname ? Path.parse(fname) : Path.parse(sourceFilePath)

      const getContentType = (extension: string): string => {
        if (extension === '') {
          return ''
        }

        const t = mime.contentType(extension)

        if (t === false) {
          return ''
        }

        return t
      }

      // const retrying = executeRequest2(env)

      return pipe(
        SRTE.fromTaskEither<Error, Stats, S, unknown>(
          TE.tryCatch(
            () => fs.stat(sourceFilePath),
            (e) => err(`error getting file info: ${JSON.stringify(e)}`),
          ),
        ),
        // () =>
        // SRTE.bindTo('fstats'),
        SRTE.bind('uploadResult', (fstats) => {
          return pipe(
            deps.upload<S>({
              contentType: getContentType(parsedSource.ext),
              filename: parsedSource.base,
              size: fstats.size,
              type: 'FILE',
              zone,
            }),
            SRTE.filterOrElse(A.isNonEmpty, () => err(`empty response`)),
          )
        }),
        SRTE.bind(
          'singleFileUploadResult',
          ({ uploadResult }) =>
            deps.singleFileUpload(
              { filePath: sourceFilePath, url: uploadResult[0].url },
            ),
        ),
        SRTE.bind(
          'updateDocumentsResult',
          ({ uploadResult, singleFileUploadResult }) =>
            deps.updateDocuments(
              {
                zone,
                data: {
                  allow_conflict: true,
                  command: 'add_file',
                  document_id: uploadResult[0].document_id,
                  path: {
                    starting_document_id: docwsid,
                    path: parsedSource.base,
                  },
                  btime: new Date().getTime(),
                  mtime: new Date().getTime(),
                  file_flags: {
                    is_executable: false,
                    is_hidden: false,
                    is_writable: true,
                  },
                  data: {
                    receipt: singleFileUploadResult.singleFile.receipt,
                    reference_signature: singleFileUploadResult.singleFile.referenceChecksum,
                    signature: singleFileUploadResult.singleFile.fileChecksum,
                    wrapping_key: singleFileUploadResult.singleFile.wrappingKey,
                    size: singleFileUploadResult.singleFile.size,
                  },
                },
              },
            ),
        ),
        SRTE.map(({ updateDocumentsResult }) => updateDocumentsResult.results[0].document),
      )
    }
  ),
)

export const createFoldersFailing = flow(
  createFolders,
  SRTE.map(_ => _.folders),
  SRTE.filterOrElse(
    (folders): folders is T.DriveChildrenItemFolder[] => pipe(folders, A.every((folder) => folder.status === 'OK')),
    () => err(`createFoldersM returned incorrect response. Existing directory?`),
  ),
)
