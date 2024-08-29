import * as A from 'fp-ts/lib/Array'
import { pipe } from 'fp-ts/lib/function'
import * as SRTE from 'fp-ts/lib/StateReaderTaskEither'
import mime from 'mime-types'
import { DepFs } from '../../deps-types/dep-fs'
import { AuthenticatedState } from '../../icloud-core/icloud-request'
import { err } from '../../util/errors'
import { Path } from '../../util/path'
import { apiMethod, DepWrappedApi } from './method'

type UploadBufferMethodDeps =
  & DepWrappedApi<'upload'>
  & DepWrappedApi<'singleFileUpload'>
  & DepWrappedApi<'updateDocuments'>

type UploadMethodDeps =
  & UploadBufferMethodDeps
  & DepFs<'fstat'>
  & DepFs<'readFile'>

export const uploadBuffer = apiMethod((deps: UploadBufferMethodDeps) =>
  <S extends AuthenticatedState>(
    { buffer, docwsid, fname, zone }: {
      zone: string
      buffer: Buffer
      docwsid: string
      fname: string
    },
  ) => {
    const parsedSource = Path.parse(fname)

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

    return pipe(
      deps.api.upload<S>({
        contentType: getContentType(parsedSource.ext),
        filename: parsedSource.base,
        size: buffer.length,
        type: 'FILE',
        zone,
      }),
      SRTE.filterOrElse(A.isNonEmpty, () => err(`api.upload: empty response`)),
      SRTE.bindTo('uploadResult'),
      SRTE.bind(
        'singleFileUploadResult',
        ({ uploadResult }) =>
          deps.api.singleFileUpload<S>(
            { filename: parsedSource.base, buffer, url: uploadResult[0].url },
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
      SRTE.mapLeft(e => err(`upload: ${e}`)),
    )
  }
)

export const upload = apiMethod((deps: UploadMethodDeps) =>
  <S extends AuthenticatedState>(
    { sourceFilePath, docwsid, fname, zone }: {
      zone: string
      sourceFilePath: string
      docwsid: string
      fname?: string
    },
  ) => {
    const parsedSource = fname ? Path.parse(fname) : Path.parse(sourceFilePath)

    return pipe(
      deps.fs.readFile(sourceFilePath),
      SRTE.fromTaskEither,
      SRTE.chain(buffer => uploadBuffer<S>({ buffer, docwsid, fname: parsedSource.base, zone })),
    )
  }
)
