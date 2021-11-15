import * as A from 'fp-ts/lib/Array'
import { constVoid, flow, pipe } from 'fp-ts/lib/function'
import * as O from 'fp-ts/lib/Option'
import * as RA from 'fp-ts/lib/ReadonlyArray'
import { not } from 'fp-ts/lib/Refinement'
import * as TE from 'fp-ts/lib/TaskEither'
import * as fs from 'fs/promises'
import mime from 'mime-types'
import Path from 'path'
import { err, InvalidGlobalSessionResponse } from '../../lib/errors'
import { fetchClient, FetchClientEither } from '../../lib/fetch-client'
import { input } from '../../lib/input'
import { logger } from '../../lib/logging'
import { authorizeSession, ICloudSessionValidated } from '../authorization/authorize'
import { zipIds } from './helpers'
import { download, retrieveItemDetails } from './requests'
import { retrieveHierarchy } from './requests'
import { createFolders, CreateFoldersResponse } from './requests/createFolders'
import { moveItemsToTrash, MoveItemToTrashResponse } from './requests/moveItemsToTrash'
import {
  retrieveItemDetailsInFolders,
  retrieveItemDetailsInFoldersHierarchy,
} from './requests/retrieveItemDetailsInFolders'
import { singleFileUpload, updateDocuments, upload } from './requests/upload'
import {
  asOption,
  DriveDetails,
  DriveDetailsFolder,
  DriveDetailsPartialWithHierarchy,
  DriveDetailsRoot,
  DriveDetailsWithHierarchy,
  DriveItemDetails,
  InvalidId,
  isNotInvalidId,
  isRootDetails,
  MaybeNotFound,
  rootDrivewsid,
} from './types'
import { invalidIdItem } from './types-io'

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

  public getRoot = (): TE.TaskEither<Error, DriveDetailsRoot> => {
    return pipe(
      this.retrieveItemDetailsInFolder(rootDrivewsid),
      TE.filterOrElse(isNotInvalidId, () => err(`not found for root details`)),
      TE.filterOrElseW(isRootDetails, () => err(`invalid root details`)),
    )
  }

  // public getZones = (): TE.TaskEither<Error, string[]> => {
  //   return pipe(
  //     this.getRoot()
  //   )
  // }

  // public byZone = (zone: string): TE.TaskEither<Error, DriveDetailsRoot> => {
  //   return pipe(
  //     this.retrieveItemDetailsInFolder(rootDrivewsid),
  //     TE.filterOrElse(isRootDetails, () => error(`invalid root details`)),
  //   )
  // }

  public upload = (sourceFilePath: string, targetId: string): TE.TaskEither<Error, void> => {
    const parsedSource = Path.parse(sourceFilePath)

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

  public retrieveItemDetailsInFolders = (drivewsids: string[]): TE.TaskEither<Error, (DriveDetails | InvalidId)[]> => {
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

  public retrieveItemDetailsInFoldersS = (drivewsids: string[]): TE.TaskEither<Error, {
    found: DriveDetails[]
    missed: string[]
  }> => {
    return pipe(
      this.retrieveItemDetailsInFolders(drivewsids),
      TE.map(ds => zipIds(drivewsids, ds)),
    )
  }

  public retrieveItemDetailsInFolderHierarchy = (
    drivewsid: string,
  ): TE.TaskEither<Error, MaybeNotFound<DriveDetailsWithHierarchy>> => {
    return pipe(
      this.retrieveItemDetailsInFoldersHierarchies([drivewsid]),
      TE.chainOptionK(() => err(`invalid response (empty array)`))(A.lookup(0)),
    )
  }

  public retrieveItemDetailsInFolderHierarchyO = (
    drivewsid: string,
  ): TE.TaskEither<Error, O.Option<DriveDetailsWithHierarchy>> => {
    return pipe(
      this.retrieveItemDetailsInFoldersHierarchies([drivewsid]),
      TE.chainOptionK(() => err(`invalid response (empty array)`))(A.lookup(0)),
      TE.map(asOption),
    )
  }

  public retrieveItemDetailsInFolderHierarchyE = (
    drivewsid: string,
  ): TE.TaskEither<Error, DriveDetailsWithHierarchy> => {
    return pipe(
      this.retrieveItemDetailsInFolderHierarchyO(drivewsid),
      TE.chain(TE.fromOption(() => err(`${drivewsid} wasnt found`))),
    )
  }

  public retrieveItemDetailsInFoldersHierarchies = (
    drivewsids: string[],
  ): TE.TaskEither<Error, (DriveDetailsWithHierarchy | InvalidId)[]> => {
    logger.debug(`retrieveItemDetailsInFoldersHierarchy: ${drivewsids}`)

    return pipe(
      this.retryingQuery(() => retrieveItemDetailsInFoldersHierarchy(this.client, this.session, { drivewsids })),
      TE.chainFirstW(({ session }) =>
        this.setSession({
          accountData: this.session.accountData,
          session,
        })
      ),
      TE.map((_) => _.response.body),
    )
  }

  public retrieveItemDetailsInFoldersHierarchiesO = flow(
    this.retrieveItemDetailsInFoldersHierarchies,
    TE.map(A.map(asOption)),
  )

  public retrieveItemDetailsInFoldersHierarchiesE = flow(
    this.retrieveItemDetailsInFoldersHierarchiesO,
    TE.map(O.sequenceArray),
    TE.chain(TE.fromOption(() => err(`missing some of the driwewsids`))),
    TE.map(RA.toArray),
  )

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

  public retrieveItemsDetails = (drivewsids: string[]): TE.TaskEither<Error, { items: DriveItemDetails[] }> => {
    logger.debug(`retrieveItemDetails`, { drivewsids })

    return pipe(
      this.retryingQuery(() => retrieveItemDetails(this.client, this.session, { drivewsids })),
      TE.chainFirstW(({ session }) =>
        this.setSession({
          accountData: this.session.accountData,
          session,
        })
      ),
      TE.map((_) => _.response.body),
    )
  }

  public retrieveItemDetailsInFolder = (drivewsid: string): TE.TaskEither<Error, (DriveDetails | InvalidId)> => {
    return pipe(
      this.retrieveItemDetailsInFolders([drivewsid]),
      TE.map(A.lookup(0)),
      TE.chain(TE.fromOption(() => err(`folder ${drivewsid} was not found`))),
    )
  }

  // public getRoot = (): TE.TaskEither<Error, DriveDetails> => {
  //   return pipe(
  //     this.retrieveItemDetailsInFolders([rootDrivewsid]),
  //     TE.map(A.lookup(0)),
  //     TE.chain(TE.fromOption(() => error(`error getting root`))),
  //   )
  // }

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
