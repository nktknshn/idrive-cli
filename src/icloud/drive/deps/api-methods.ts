import { apply } from 'fp-ts/function'
import * as A from 'fp-ts/lib/Array'
import { flow, pipe } from 'fp-ts/lib/function'
import * as NA from 'fp-ts/lib/NonEmptyArray'
import * as RTE from 'fp-ts/lib/ReaderTaskEither'
import * as SRTE from 'fp-ts/lib/StateReaderTaskEither'
import { Stats } from 'fs'
import mime from 'mime-types'
import { Readable } from 'stream'
import { err } from '../../../lib/errors'
import { DepFs } from '../../../lib/fs'
import { NEA } from '../../../lib/types'
import { Path } from '../../../lib/util'
import { AuthorizedState } from '../../authorization/authorize'
import { getMissedFound } from '../helpers'
import { getUrlStream as getUrlStream_ } from '../requests/download'
import { BasicState } from '../requests/request'
import * as T from '../types'
import { DepApi, useApi as useApi } from './api-type'
import { DepFetchClient } from './util'

/** basic icloud api requests as standalone depended functions*/
export const renameItems = useApi((_: DepApi<'renameItems'>) => _.api.renameItems)

export const putBackItemsFromTrash = useApi((_: DepApi<'putBackItemsFromTrash'>) => _.api.putBackItemsFromTrash)

export const moveItems = useApi((_: DepApi<'moveItems'>) => _.api.moveItems)

export const moveItemsToTrash = useApi((_: DepApi<'moveItemsToTrash'>) => _.api.moveItemsToTrash)

export const retrieveItemDetailsInFolders = useApi((_: DepApi<'retrieveItemDetailsInFolders'>) =>
  _.api.retrieveItemDetailsInFolders
)

export const download = useApi((_: DepApi<'download'>) => _.api.download)

export const downloadBatch = useApi((_: DepApi<'downloadBatch'>) => _.api.downloadBatch)

export const createFolders = useApi((_: DepApi<'createFolders'>) => _.api.createFolders)

export const authorizeSession = <S extends BasicState>() =>
  SRTE.asksStateReaderTaskEitherW(
    (_: DepApi<'authorizeSession'>) => _.api.authorizeSession<S>(),
  )

/** higher level methods based and dependent on the basic functions */

export const authorizeState = <
  S extends BasicState,
>(
  state: S,
) =>
  pipe(
    authorizeSession<S>()(state),
    RTE.map(([accountData, state]) => ({ ...state, accountData })),
  )

export const getUrlStream = ({ url }: {
  url: string
}): RTE.ReaderTaskEither<DepFetchClient, Error, Readable> =>
  pipe(
    RTE.ask<DepFetchClient>(),
    RTE.chainTaskEitherK(flow(getUrlStream_, apply({ url }))),
  )

export const retrieveItemDetailsInFoldersSeparated = <S extends AuthorizedState>(
  drivewsids: NEA<string>,
) =>
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

/** .data_token?.url ?? _.package_token?.url */
export const getItemUrl = flow(
  download,
  SRTE.map(
    _ => _.data_token?.url ?? _.package_token?.url,
  ),
)

export type UploadMethodDeps =
  & DepApi<'upload'>
  & DepApi<'singleFileUpload'>
  & DepApi<'updateDocuments'>
  & DepFs<'fstat'>
  & DepFs<'readFile'>

export const upload = flow(
  useApi((deps: UploadMethodDeps) =>
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
          deps.fs.fstat(sourceFilePath),
        ),
        // () =>
        // SRTE.bindTo('fstats'),
        SRTE.bind('uploadResult', (fstats) => {
          return pipe(
            deps.api.upload<S>({
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
            pipe(
              deps.fs.readFile(sourceFilePath),
              SRTE.fromTaskEither,
              SRTE.chain(buffer =>
                deps.api.singleFileUpload<S>(
                  { filename: parsedSource.base, buffer, url: uploadResult[0].url },
                )
              ),
            ),
        ),
        SRTE.bind(
          'updateDocumentsResult',
          ({ uploadResult, singleFileUploadResult }) =>
            deps.api.updateDocuments(
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
