import * as A from 'fp-ts/lib/Array'
import { flow, pipe } from 'fp-ts/lib/function'
import * as SRTE from 'fp-ts/lib/StateReaderTaskEither'
import { Stats } from 'fs'
import mime from 'mime-types'
import { DepFs } from '../../../../deps/DepFs'
import { err } from '../../../../util/errors'
import { Path } from '../../../../util/path'
import { AuthorizedState } from '../../../request'
import { GetDep, useApi } from '../deps'

export type UploadMethodDeps =
  & GetDep<'upload'>
  & GetDep<'singleFileUpload'>
  & GetDep<'updateDocuments'>
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
