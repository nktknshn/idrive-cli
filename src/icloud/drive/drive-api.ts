import * as A from 'fp-ts/lib/Array'
import { constVoid, pipe } from 'fp-ts/lib/function'
import * as TE from 'fp-ts/lib/TaskEither'
import * as fs from 'fs/promises'
import mime from 'mime-types'
import Path from 'path'
import { error, InvalidGlobalSessionResponse } from '../../lib/errors'
import { fetchClient, FetchClientEither } from '../../lib/fetch-client'
import { input } from '../../lib/input'
import { logger } from '../../lib/logging'
import { authorizeSession, ICloudSessionValidated } from '../authorization/authorize'
import { download } from './requests'
import { retrieveHierarchy } from './requests'
import { createFolders, CreateFoldersResponse } from './requests/createFolders'
import { moveItemsToTrash, MoveItemToTrashResponse } from './requests/moveItemsToTrash'
import { retrieveItemDetailsInFolders } from './requests/retrieveItemDetailsInFolders'
import { singleFileUpload, updateDocuments, upload } from './requests/upload'
import { DriveDetails, DriveDetailsFolder, DriveDetailsPartialWithHierarchy, rootDrivewsid } from './types'

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

export class DriveApi {
  private _apiCalls = 0

  private incApiCalls = (n = 1) => {
    this._apiCalls += n
  }

  get apiCalls(): number {
    return this._apiCalls
  }

  constructor(
    private session: ICloudSessionValidated,
    public client: FetchClientEither = fetchClient,
  ) {}

  private onInvalidSession = (): TE.TaskEither<Error, void> => {
    return pipe(
      authorizeSession(
        this.client,
        this.session.session,
        { getCode: input({ prompt: 'code: ' }) },
      ),
      TE.chainW(this.setSession),
    )
  }

  private retryingQuery = <E extends Error, A>(
    te: () => TE.TaskEither<E, A>,
  ): TE.TaskEither<Error, A> => {
    this.incApiCalls()

    return pipe(
      te(),
      TE.orElseW((e) => {
        return InvalidGlobalSessionResponse.is(e)
          ? pipe(
            this.onInvalidSession(),
            TE.chainW(() => this.retryingQuery(te)),
          )
          : TE.left(e)
      }),
    )
  }

  private setSession = (
    session: ICloudSessionValidated,
  ): TE.TaskEither<never, void> => {
    return TE.fromTask<void, never>(async () => {
      this.session = session
    })
  }

  public getSession = (): ICloudSessionValidated => this.session

  public upload = (sourceFilePath: string, targetId: string): TE.TaskEither<Error, void> => {
    const parsedSource = Path.parse(sourceFilePath)

    return pipe(
      TE.Do,
      TE.bind('fstats', () =>
        TE.tryCatch(
          () => fs.stat(sourceFilePath),
          (e) => error(`error getting file info: ${JSON.stringify(e)}`),
        )),
      TE.bind('uploadResult', ({ fstats }) =>
        pipe(
          () =>
            upload(this.client, this.session, {
              contentType: getContentType(parsedSource.ext),
              filename: parsedSource.base,
              size: fstats.size,
              type: 'FILE',
            }),
          this.retryingQuery,
          TE.filterOrElse(
            (_) => _.response.body.length > 0,
            () => error(`empty response`),
          ),
        )),
      TE.bind(
        'singleFileUploadResult',
        ({ uploadResult: { session, response } }) =>
          this.retryingQuery(() =>
            singleFileUpload(
              this.client,
              { session, accountData: this.session.accountData },
              { filePath: sourceFilePath, url: response.body[0].url },
            )
          ),
      ),
      TE.bind(
        'updateDocumentsResult',
        ({ uploadResult, singleFileUploadResult: { response, session } }) =>
          pipe(() =>
            updateDocuments(
              this.client,
              { session, accountData: this.session.accountData },
              {
                request: {
                  allow_conflict: true,
                  command: 'add_file',
                  document_id: uploadResult.response.body[0].document_id,
                  path: {
                    starting_document_id: targetId,
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
                    receipt: response.body.singleFile.receipt,
                    reference_signature: response.body.singleFile.referenceChecksum,
                    signature: response.body.singleFile.fileChecksum,
                    wrapping_key: response.body.singleFile.wrappingKey,
                    size: response.body.singleFile.size,
                  },
                },
              },
            ), this.retryingQuery),
      ),
      TE.chainW(() => TE.of(constVoid())),
    )
  }

  public retrieveItemDetailsInFolders = (drivewsids: string[]): TE.TaskEither<Error, DriveDetails[]> => {
    logger.debug(`retrieveItemDetailsInFolders`, { drivewsids })

    return pipe(
      this.retryingQuery(() =>
        retrieveItemDetailsInFolders(this.client, this.session, {
          partialData: false,
          includeHierarchy: false,
          drivewsids,
        })
      ),
      TE.chainFirstW(({ session }) =>
        this.setSession({
          accountData: this.session.accountData,
          session,
        })
      ),
      TE.map((_) => _.response.body),
    )
  }

  public retrieveHierarchy = (drivewsids: string[]): TE.TaskEither<Error, DriveDetailsPartialWithHierarchy[]> => {
    logger.debug(`retrieveHierarchy`, { drivewsids })

    return pipe(
      this.retryingQuery(() => retrieveHierarchy(this.client, this.session, { drivewsids })),
      TE.chainFirstW(({ session }) =>
        this.setSession({
          accountData: this.session.accountData,
          session,
        })
      ),
      TE.map((_) => _.response.body),
    )
  }

  public retrieveItemDetailsInFolder = (drivewsid: string): TE.TaskEither<Error, DriveDetails> => {
    return pipe(
      this.retrieveItemDetailsInFolders([drivewsid]),
      TE.map(A.lookup(0)),
      TE.chain(TE.fromOption(() => error(`folder ${drivewsid} was not found`))),
    )
  }

  public getRoot = (): TE.TaskEither<Error, DriveDetails> => {
    return pipe(
      this.retrieveItemDetailsInFolders([rootDrivewsid]),
      TE.map(A.lookup(0)),
      TE.chain(TE.fromOption(() => error(`error getting root`))),
    )
  }

  public download = (
    documentId: string,
    zone: string,
  ): TE.TaskEither<Error, string> => {
    return pipe(
      this.retryingQuery(() => download(this.client, this.session, { documentId, zone })),
      TE.chainFirstW(({ session }) =>
        this.setSession({
          accountData: this.session.accountData,
          session,
        })
      ),
      TE.map((_) => _.response.body.data_token.url),
    )
  }

  public createFolders = (parentId: string, folderNames: string[]): TE.TaskEither<Error, CreateFoldersResponse> => {
    return pipe(
      this.retryingQuery(() =>
        createFolders(this.client, this.session, {
          destinationDrivewsId: parentId,
          names: folderNames,
        })
      ),
      TE.chainFirstW(({ session }) =>
        this.setSession({
          accountData: this.session.accountData,
          session,
        })
      ),
      TE.map((_) => _.response.body),
    )
  }

  public moveItemsToTrash = (
    items: { drivewsid: string; etag: string }[],
  ): TE.TaskEither<Error, MoveItemToTrashResponse> => {
    return pipe(
      this.retryingQuery(() => moveItemsToTrash(this.client, this.session, { items })),
      TE.chainFirstW(({ session }) =>
        this.setSession({
          accountData: this.session.accountData,
          session,
        })
      ),
      TE.map((_) => _.response.body),
    )
  }
}
