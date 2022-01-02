import * as A from 'fp-ts/lib/Array'
import { flow, pipe } from 'fp-ts/lib/function'
import * as O from 'fp-ts/lib/Option'
import * as RA from 'fp-ts/lib/ReadonlyArray'
import * as TE from 'fp-ts/lib/TaskEither'
import * as fs from 'fs/promises'
import mime from 'mime-types'
import Path from 'path'
import { err, InvalidGlobalSessionResponse } from '../../lib/errors'
import { fetchClient, FetchClientEither } from '../../lib/http/fetch-client'
import { input } from '../../lib/input'
import { logger } from '../../lib/logging'
import { authorizeSession, ICloudSessionValidated } from '../authorization/authorize'
import { getMissedFound } from './helpers'
import { download, retrieveHierarchy, retrieveItemDetails, retrieveTrashDetails } from './requests'
import { createFolders, CreateFoldersResponse } from './requests/createFolders'
import { ResponseWithSession } from './requests/http'
import { moveItems } from './requests/moveItems'
import { moveItemsToTrash, MoveItemToTrashResponse } from './requests/moveItemsToTrash'
import { renameItems, RenameResponse } from './requests/rename'
import {
  retrieveItemDetailsInFolders,
  retrieveItemDetailsInFoldersHierarchy,
} from './requests/retrieveItemDetailsInFolders'
import { putBackItemsFromTrash } from './requests/retrieveTrashDetails'
import * as T from './requests/types/types'
import { rootDrivewsid } from './requests/types/types-io'
import { singleFileUpload, updateDocuments, upload } from './requests/upload'

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

  // public getRoot = (): TE.TaskEither<Error, T.DetailsRoot> => {
  //   return pipe(
  //     this.retrieveItemDetailsInFolder(rootDrivewsid),
  //     TE.filterOrElse(T.isNotInvalidId, () => err(`not found for root details`)),
  //     TE.filterOrElseW(T.isCloudDocsRootDetails, () => err(`invalid root details`)),
  //   )
  // }

  public upload = (
    sourceFilePath: string,
    docwsid: string,
    fname?: string,
  ): TE.TaskEither<Error, { document_id: string; zone: string; parent_id: string; type: string; etag: string }> => {
    const parsedSource = fname ? Path.parse(fname) : Path.parse(sourceFilePath)

    logger.debug(`upload: ${sourceFilePath} into=${docwsid} fname=${parsedSource.base}.${parsedSource.ext}`)

    return pipe(
      TE.Do,
      TE.bind('fstats', () =>
        TE.tryCatch(
          () => fs.stat(sourceFilePath),
          (e) => err(`error getting file info: ${JSON.stringify(e)}`),
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
            () => err(`empty response`),
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
                data: {
                  allow_conflict: true,
                  command: 'add_file',
                  document_id: uploadResult.response.body[0].document_id,
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
      TE.chainW(({ singleFileUploadResult, updateDocumentsResult, uploadResult }) =>
        TE.of(updateDocumentsResult.response.body.results[0].document)
      ),
    )
  }

  public renameItems = (items: {
    drivewsid: string
    etag: string
    name: string
    extension?: string
  }[]): TE.TaskEither<Error, RenameResponse> => {
    // logger.debug(`retrieveItemDetailsInFolders: ${drivewsids}`)

    return pipe(
      this.retryingWithSession(
        () => renameItems(this.client, this.session, { items }),
      ),
    )
  }

  public retrieveTrashDetails = (): TE.TaskEither<Error, T.DetailsTrash> => {
    return pipe(
      this.retryingWithSession(
        () => retrieveTrashDetails(this.client, this.session),
      ),
    )
  }

  public putBackItemsFromTrash = (
    items: [{ drivewsid: string; etag: string }],
  ): TE.TaskEither<Error, { items: T.DriveChildrenItem[] }> => {
    return pipe(
      this.retryingWithSession(
        () => putBackItemsFromTrash(this.client, this.session, items),
      ),
    )
  }

  public retrieveItemDetailsInFolders = (drivewsids: string[]): TE.TaskEither<Error, (T.Details | T.InvalidId)[]> => {
    return pipe(
      this.retryingWithSession(
        () => retrieveItemDetailsInFolders(this.client, this.session, { drivewsids }),
      ),
    )
  }

  public retrieveItemDetailsInFoldersO = (drivewsids: string[]): TE.TaskEither<Error, (O.Option<T.Details>)[]> => {
    return pipe(
      this.retrieveItemDetailsInFolders(drivewsids),
      TE.map(A.map(T.invalidIdToOption)),
    )
  }

  public retrieveItemDetailsInFoldersS = (drivewsids: string[]): TE.TaskEither<Error, {
    found: T.Details[]
    missed: string[]
  }> => {
    return pipe(
      this.retrieveItemDetailsInFolders(drivewsids),
      TE.map(ds => getMissedFound(drivewsids, ds)),
    )
  }

  public retrieveItemDetailsInFolderHierarchy = (
    drivewsid: string,
  ): TE.TaskEither<Error, T.MaybeNotFound<T.DriveDetailsWithHierarchy>> => {
    return pipe(
      this.retrieveItemDetailsInFoldersHierarchies([drivewsid]),
      TE.chainOptionK(() => err(`invalid response (empty array)`))(A.lookup(0)),
    )
  }

  public retrieveItemDetailsInFolderHierarchyO = (
    drivewsid: string,
  ): TE.TaskEither<Error, O.Option<T.DriveDetailsWithHierarchy>> => {
    return pipe(
      this.retrieveItemDetailsInFoldersHierarchies([drivewsid]),
      TE.chainOptionK(() => err(`invalid response (empty array)`))(A.lookup(0)),
      TE.map(T.invalidIdToOption),
    )
  }

  public retrieveItemDetailsInFolderHierarchyE = (
    drivewsid: string,
  ): TE.TaskEither<Error, T.DriveDetailsWithHierarchy> => {
    return pipe(
      this.retrieveItemDetailsInFolderHierarchyO(drivewsid),
      TE.chain(TE.fromOption(() => err(`${drivewsid} wasn't found`))),
    )
  }

  public retrieveItemDetailsInFoldersHierarchies = (
    drivewsids: string[],
  ): TE.TaskEither<Error, (T.DriveDetailsWithHierarchy | T.InvalidId)[]> => {
    logger.debug(`retrieveItemDetailsInFoldersHierarchy: [${drivewsids}]`)

    return pipe(
      this.retryingWithSession(() => retrieveItemDetailsInFoldersHierarchy(this.client, this.session, { drivewsids })),
    )
  }

  public retrieveItemDetailsInFoldersHierarchiesO = flow(
    this.retrieveItemDetailsInFoldersHierarchies,
    TE.map(A.map(T.invalidIdToOption)),
  )

  public retrieveItemDetailsInFoldersHierarchiesS = (drivewsids: string[]) =>
    pipe(
      this.retrieveItemDetailsInFoldersHierarchies(drivewsids),
      TE.map(ds => getMissedFound(drivewsids, ds)),
    )

  public retrieveItemDetailsInFoldersHierarchiesE = flow(
    this.retrieveItemDetailsInFoldersHierarchiesO,
    TE.map(O.sequenceArray),
    TE.chain(TE.fromOption(() => err(`missing some of the driwewsids`))),
    TE.map(RA.toArray),
  )

  public retrieveHierarchy = (drivewsids: string[]): TE.TaskEither<Error, T.DriveDetailsPartialWithHierarchy[]> => {
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

  public retrieveItemsDetails = (drivewsids: string[]): TE.TaskEither<Error, { items: T.DriveItemDetails[] }> => {
    logger.debug(`retrieveItemDetails`, { drivewsids })

    return pipe(
      this.retryingWithSession(
        () => retrieveItemDetails(this.client, this.session, { drivewsids }),
      ),
    )
  }

  public retrieveItemsDetailsO = (drivewsids: string[]): TE.TaskEither<Error, O.Option<T.DriveItemDetails>[]> => {
    return pipe(
      this.retrieveItemsDetails(drivewsids),
      TE.map(details =>
        pipe(
          drivewsids,
          A.map(drivewsid =>
            pipe(
              details.items,
              A.findFirst(_ => _.drivewsid == drivewsid),
            )
          ),
        )
      ),
    )
  }

  public retrieveItemDetailsO = (drivewsid: string): TE.TaskEither<Error, O.Option<T.DriveItemDetails>> => {
    return pipe(
      this.retrieveItemsDetails([drivewsid]),
      TE.map(_ => A.lookup(0)(_.items)),
    )
  }

  public retrieveItemDetailsE = (drivewsid: string): TE.TaskEither<Error, T.DriveItemDetails> => {
    return pipe(
      this.retrieveItemDetailsO(drivewsid),
      TE.chain(TE.fromOption(() => err(`${drivewsid} wasn't found`))),
    )
  }

  public retrieveItemDetailsInFolder = (drivewsid: string): TE.TaskEither<Error, (T.Details | T.InvalidId)> => {
    return pipe(
      this.retrieveItemDetailsInFolders([drivewsid]),
      TE.map(A.lookup(0)),
      TE.chain(TE.fromOption(() => err(`folder ${drivewsid} was not found`))),
    )
  }

  public download = (
    documentId: string,
    zone: string,
  ): TE.TaskEither<Error, string> => {
    return pipe(
      this.retryingWithSession(
        () => download(this.client, this.session, { documentId, zone }),
      ),
      TE.map((_) => _.data_token.url),
    )
  }

  public createFolders = (parentId: string, folderNames: string[]): TE.TaskEither<Error, CreateFoldersResponse> => {
    return pipe(
      this.retryingWithSession(() =>
        createFolders(this.client, this.session, {
          destinationDrivewsId: parentId,
          names: folderNames,
        })
      ),
    )
  }

  public moveItems = (
    destinationDrivewsId: string,
    items: { drivewsid: string; etag: string }[],
  ) => {
    return pipe(
      this.retryingWithSession(
        () => moveItems(this.client, this.session, { destinationDrivewsId, items }),
      ),
    )
  }

  public moveItemsToTrash = (
    items: { drivewsid: string; etag: string }[],
    trash: boolean,
  ): TE.TaskEither<Error, MoveItemToTrashResponse> => {
    return pipe(
      this.retryingWithSession(() => moveItemsToTrash(this.client, this.session, { items, trash })),
    )
  }

  public retryingWithSession = <E extends Error, A>(
    te: () => TE.TaskEither<E, ResponseWithSession<A>>,
  ): TE.TaskEither<Error, A> => {
    return pipe(
      te,
      this.retryingQuery,
      TE.chainFirstW(({ session }) =>
        this.setSession({
          accountData: this.session.accountData,
          session,
        })
      ),
      TE.map((_) => _.response.body),
    )
  }

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
}
