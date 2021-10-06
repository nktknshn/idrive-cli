import { DriveDetailsFolder, DriveChildrenItem, Hierarchy, DriveChildrenItemAppLibrary, DriveChildrenItemFile, DriveChildrenItemFolder, rootDrivewsid, isRootDetails, DriveDetailsRoot, DriveDetailsAppLibrary, DriveDetails, WithId } from "../types";
import * as O from 'fp-ts/lib/Option'
import * as R from 'fp-ts/lib/Record'
import * as A from 'fp-ts/lib/Array'
import * as E from 'fp-ts/lib/Either'
import { hasOwnProperty, isObjectWithOwnProperty } from "../../../lib/util";
import { logger } from "../../../lib/logging";
import { constant, constVoid, flow, identity, pipe } from "fp-ts/lib/function";
import Path from "path";
import { fst } from "fp-ts/lib/Tuple";
import * as m from 'monocle-ts'
import { ICloudSessionState } from "../../session/session";
import { authorizeSession, ICloudSessionValidated } from "../../authorization/authorize";
import { fetchClient, FetchClientEither } from "../../../lib/fetch-client";
import { InvalidGlobalSessionResponse, retrieveItemDetailsInFolders } from "../retrieveItemDetailsInFolders";
import * as TE from 'fp-ts/lib/TaskEither';
import { input } from "../../../lib/input";
import { error } from "../../../lib/errors";
import { normalizePath, parsePath } from "../helpers";
import { tryReadJsonFile, TypeDecodingError } from "../../../lib/files";
import { saveJson } from "../../session/session-file";
import { download } from "../download";

export class InconsistentCache extends Error {
    static is(e: Error): e is InconsistentCache { return e instanceof InconsistentCache }
    constructor(message?: string) { super(message) }
    static create(message?: string): InconsistentCache { return new InconsistentCache(message) }
}

class MissingParentError extends InconsistentCache {
    constructor(message?: string) { super(message) }
    static create(message?: string): MissingParentError { return new MissingParentError(message) }
}

type DetailsType<T extends string> = `${T}`
type ItemType<T extends string> = `${T}`

interface CacheEntityFolderRoot {
    readonly details: DriveDetailsRoot
    readonly type: 'ROOT'
    readonly hasDetails: true
}

interface CacheEntityFolderDetails {
    readonly details: DriveDetailsFolder
    readonly type: DetailsType<DriveChildrenItemFolder['type']>
    readonly hasDetails: true
}

interface CacheEntityFolderItem {
    readonly item: DriveChildrenItemFolder
    readonly type: ItemType<DriveChildrenItemFolder['type']>
    readonly hasDetails: false
}

interface CacheEntityAppLibraryDetails {
    readonly details: DriveDetailsAppLibrary
    readonly type: DetailsType<DriveChildrenItemAppLibrary['type']>
    readonly hasDetails: true
}

interface CacheEntityAppLibraryItem {
    readonly item: DriveChildrenItemAppLibrary
    readonly type: ItemType<DriveChildrenItemAppLibrary['type']>
    readonly hasDetails: false
}

interface CacheEntityFile {
    readonly item: DriveChildrenItemFile
    readonly type: ItemType<DriveChildrenItemFile['type']>
}

type CacheEntityFolder = CacheEntityFolderRoot | CacheEntityFolderDetails | CacheEntityFolderItem
type CacheEntityAppLibrary = CacheEntityAppLibraryItem | CacheEntityAppLibraryDetails

export type ICloudDriveCacheEntity = CacheEntityFolder | CacheEntityAppLibrary | CacheEntityFile
export type ICloudDriveCacheEntityType = ICloudDriveCacheEntity['type']

export interface ICloudDriveCache {
    readonly byDrivewsid: { readonly [drivewsid: string]: ICloudDriveCacheEntity }
    readonly byPath: { readonly [path: string]: ICloudDriveCacheEntity }
    readonly root: O.Option<DriveDetailsRoot>
}

namespace lens {
    export const root = m.Lens.fromProp<ICloudDriveCache>()('root')
    export const byPath = m.Lens.fromProp<ICloudDriveCache>()('byPath')
    export const byDrivewsid = m.Lens.fromProp<ICloudDriveCache>()('byDrivewsid')

    // export const update = byPath.compose(byDrivewsid)
}

const rootPath = '/'
/* 
function cacheEntity(type: CacheEntityFile['type'], item: DriveChildrenItemFile): ICloudDriveCacheEntity
function cacheEntity(type: CacheEntityFolder['type'], details: DriveDetailsFolder): ICloudDriveCacheEntity
function cacheEntity(type: CacheEntityFolder['type'], item: DriveChildrenItemFolder): ICloudDriveCacheEntity
function cacheEntity(type: CacheEntityAppLibrary['type'], details: DriveDetailsAppLibrary): ICloudDriveCacheEntity
function cacheEntity(type: CacheEntityAppLibrary['type'], item: DriveChildrenItemAppLibrary): ICloudDriveCacheEntity
function cacheEntity(type: ICloudDriveCacheEntityType, itemOrDetails: object): ICloudDriveCacheEntity {
    if (type === 'FILE') {
        return {
            type: 'FILE',
            item: itemOrDetails as DriveChildrenItemFile,
            hasDetails: false
        }
    }
    else if (type === 'FOLDER') {
        if (hasOwnProperty(itemOrDetails, 'items'))
            return {
                type: 'FOLDER',
                details: itemOrDetails as DriveDetailsFolder,
                hasDetails: true
            }
        else {
            return {
                type: 'FOLDER',
                item: itemOrDetails as DriveChildrenItemFolder,
                hasDetails: false
            }
        }
    }
    else if (type === 'APP_LIBRARY') {
        if (hasOwnProperty(itemOrDetails, 'items'))
            return {
                type: 'APP_LIBRARY',
                details: itemOrDetails as DriveDetailsAppLibrary,
                hasDetails: true
            }
        else {
            return {
                type: 'APP_LIBRARY',
                item: itemOrDetails as DriveChildrenItemAppLibrary,
                hasDetails: false
            }
        }
    }

    return type
} */

export const cachef = (): ICloudDriveCache => ({
    byPath: {},
    byDrivewsid: {},
    root: O.none
})

export const entityId = (e: ICloudDriveCacheEntity) =>
    entityContent(e).drivewsid

export const entityEtag = (e: ICloudDriveCacheEntity) =>
    entityContent(e).etag

export const entityName = (e: ICloudDriveCacheEntity) =>
    entityContent(e).name

export const entityContent = (e: ICloudDriveCacheEntity) =>
    e.type === 'FILE'
        ? e.item
        : e.hasDetails
            ? e.details
            : e.item

export const getCachedPathForId = (drivewsid: string) => (cache: ICloudDriveCache): O.Option<string> => {

    if (drivewsid === rootDrivewsid) {
        return pipe(cache.root, O.map(constant('/')))
    }

    return pipe(
        R.toArray(cache.byPath),
        A.findFirst(([path, entity]) => entityId(entity) === drivewsid),
        O.map(fst)
    )
}

const isFolderLikeCacheEntity = (entity: ICloudDriveCacheEntity): entity is CacheEntityFolder | CacheEntityAppLibrary => entity.type !== 'FILE'

const isFolderLikeType = (type: ICloudDriveCacheEntity['type']): type is (CacheEntityFolder | CacheEntityAppLibrary)['type'] => type !== 'FILE'

// const folderDetailsEntity = (details: DriveDetailsFolder)

const cacheEntityFromDetails = (details: DriveDetails): ICloudDriveCacheEntity =>
    isRootDetails(details) ? ({
        type: 'ROOT', details, hasDetails: true
    }) : details.type === 'FOLDER'
        ? ({ type: details.type, details, hasDetails: true })
        : ({ type: details.type, details, hasDetails: true })

const cacheEntityFromItem = (item: DriveChildrenItem): ICloudDriveCacheEntity => {
    return item.type === 'FILE'
        ? ({ type: item.type, item, hasDetails: false })
        : item.type === 'FOLDER'
            ? ({ type: item.type, item, hasDetails: false })
            : ({ type: item.type, item, hasDetails: false })
}

export const getById = (drivewsid: string) => (cache: ICloudDriveCache): O.Option<ICloudDriveCacheEntity> => {
    return pipe(
        cache.byDrivewsid,
        R.lookup(drivewsid)
    )
}

const addItems = (items: DriveChildrenItem[]) => (cache: ICloudDriveCache): E.Either<Error, ICloudDriveCache> => {
    return pipe(
        items,
        A.reduce(E.of(cache), (acc, cur) => pipe(acc, E.chain(putItem(cur))))
    )
}

const isEntityNewer = (cached: ICloudDriveCacheEntity, entity: ICloudDriveCacheEntity) => {
    if (entity.type === 'FILE' || cached.type === 'FILE') {
        return entityEtag(cached) !== entityEtag(entity)
    }

    if (!cached.hasDetails && entity.hasDetails) {
        return true
    }

    return entityEtag(cached) !== entityEtag(entity)
}

const putRoot = (details: DriveDetailsRoot): ((s: ICloudDriveCache) => E.Either<Error, ICloudDriveCache>) => {
    return flow(
        lens.root.set(O.some(details)),
        lens.byDrivewsid.modify(
            R.upsertAt(rootDrivewsid, cacheEntityFromDetails(details))),
        lens.byPath.modify(
            R.upsertAt('/', cacheEntityFromDetails(details))),
        addItems(details.items)
    )
}

export const putDetails = (details: DriveDetails): ((cache: ICloudDriveCache) => E.Either<Error, ICloudDriveCache>) => {

    if (isRootDetails(details)) {
        return cache => {
            if (O.isSome(cache.root)) {
                if (cache.root.value.etag === details.etag) {
                    return E.of(cache)
                }
            }

            return putRoot(details)(cache)
        }
    }

    return cache => pipe(
        E.Do,
        E.bind('parentPath', () => pipe(
            getCachedPathForId(details.parentId)(cache),
            E.fromOption(() => MissingParentError.create(`missing parent ${details.parentId} in cache`)))),
        E.bind('detailsPath', ({ parentPath }) => E.of(Path.join(parentPath, details.name))),
        E.bind('entity', () => E.of(cacheEntityFromDetails(details))),
        E.bind('updated', ({ entity }) => E.of(pipe(
            cache,
            getById(entityId(entity)),
            O.map(cached => isEntityNewer(cached, entity)),
            O.fold(() => true, identity)
        ))),
        E.chain(({ parentPath, entity, detailsPath, updated }) => updated
            ? pipe(
                cache,
                lens.byPath.modify(
                    R.upsertAt(detailsPath, entity)),
                lens.byDrivewsid.modify(
                    R.upsertAt(details.drivewsid, entity)),
                addItems(details.items))
            : E.of(cache)
        ),
    )
}

export const putItem = (item: DriveChildrenItem): ((cache: ICloudDriveCache) => E.Either<Error, ICloudDriveCache>) => {
    return cache => pipe(
        cache,
        getCachedPathForId(item.parentId),
        E.fromOption(() =>
            MissingParentError.create(`missing parent ${item.parentId} in cache`)),
        E.map(parentPath =>
            pipe(
                cache,
                lens.byPath.modify(
                    R.upsertAt(Path.join(parentPath, item.name), cacheEntityFromItem(item))),
                lens.byDrivewsid.modify(
                    R.upsertAt(item.drivewsid, cacheEntityFromItem(item)))
            )
        )
    )
}

const validateCacheJson = (json: unknown): json is ICloudDriveCache => {
    return isObjectWithOwnProperty(json, 'byPath') && hasOwnProperty(json, 'root')
}

// export function getUrlArrayBuffer({
//     client, url
// }: { client: FetchClientEither, url: string }) {
//     return client({
//         method: 'GET',
//         url,
//         headers = 
//     })
//         // .flatMap(resp =>
//         //     tryCatchTask(
//         //         () => resp.arrayBuffer(),
//         //         e => `error reading blob: ${e}`
//         //     ))
// }

export class Cache {
    private cache: ICloudDriveCache

    static tryReadFromFile = (
        accountDataFilePath: string
    ): TE.TaskEither<Error, ICloudDriveCache> => {
        return pipe(
            tryReadJsonFile(accountDataFilePath),
            TE.chainW(
                json => {
                    if (validateCacheJson(json)) {
                        return TE.right(json)
                    }
                    return TE.left(TypeDecodingError.create([], 'wrong ICloudDriveCache json'))
                }
            )
        )
    }

    static trySaveFile = (
        cache: Cache,
        cacheFilePath: string
    ): TE.TaskEither<Error, void> => {
        return pipe(
            saveJson(cacheFilePath)(cache.cache)
        )
    }

    constructor(
        cache: ICloudDriveCache = cachef()
    ) {
        this.cache = cache
    }

    putDetails = (details: DriveDetails) => {
        return pipe(
            this.cache,
            putDetails(details),
            E.map(Cache.create)
        )
    }

    putItem = (item: DriveChildrenItem) => {
        return pipe(
            this.cache,
            putItem(item),
            E.map(Cache.create)
        )
    }

    getById = (drivewsid: string): O.Option<ICloudDriveCacheEntity> => {
        return pipe(
            this.cache.byDrivewsid,
            R.lookup(drivewsid)
        )
    }

    getByPath = (path: string): O.Option<ICloudDriveCacheEntity> => {
        return pipe(
            this.cache.byPath,
            R.lookup(normalizePath(path))
        )
    }

    getByIdU = (drivewsid: string) => {
        return pipe(this.getById(drivewsid), O.toUndefined)
    }

    getByPathU = (path: string) => {
        return pipe(this.getByPath(path), O.toUndefined)
    }

    getCachedPathForId = (drivewsid: string) => {
        return getCachedPathForId(drivewsid)(this.cache)
    }

    static create(
        cache: ICloudDriveCache = cachef()
    ) {
        return new Cache(cache)
    }
}

export class DriveApi {
    constructor(
        private session: ICloudSessionValidated,
        private client: FetchClientEither = fetchClient
    ) { }

    private onInvalidSession = () => {
        return pipe(
            authorizeSession({
                client: this.client,
                getCode: input({ prompt: 'code: ' }),
                session: this.session.session
            }),
            TE.chainW(_ => this.setSession(_))
        )
    }

    public download = (fileId: string): TE.TaskEither<Error, string> => {
        const query = () => download({
            client: this.client,
            validatedSession: this.session,
            documentId: fileId
        })

        return pipe(
            query(),
            TE.orElse(e => {
                return InvalidGlobalSessionResponse.is(e)
                    ? pipe(this.onInvalidSession(), TE.chainW(query))
                    : TE.left(e)
            }),
            TE.chainFirstW(({ session }) =>
                this.setSession({
                    accountData: this.session.accountData,
                    session
                })
            ),
            TE.map(_ => _.response.body.data_token.url)
        )
    }

    public retrieveItemDetailsInFolders = (drivewsids: string[]) => {

        logger.info(`retrieveItemDetailsInFolders(${drivewsids})`)

        const query = () => retrieveItemDetailsInFolders({
            client: this.client,
            partialData: false,
            includeHierarchy: false,
            validatedSession: this.session,
            drivewsids
        })

        return pipe(
            query(),
            TE.orElse(e => {
                return InvalidGlobalSessionResponse.is(e)
                    ? pipe(this.onInvalidSession(), TE.chainW(query))
                    : TE.left(e)
            }),
            TE.chainFirstW(({ session }) =>
                this.setSession({
                    accountData: this.session.accountData,
                    session
                })
            ),
            TE.map(_ => _.response.details)
        )
    }

    public retrieveItemDetailsInFolder = (drivewsid: string) => {
        return pipe(
            this.retrieveItemDetailsInFolders([drivewsid]),
            TE.map(A.lookup(0)),
            TE.chain(TE.fromOption(() => error(`folder ${drivewsid} was not found`))),
        )
    }

    private setSession(
        session: ICloudSessionValidated
    ): TE.TaskEither<never, void> {
        return TE.fromTask<void, never>(
            async () => { this.session = session }
        )
    }

    public getSession = () => this.session
}

type Effect<A> = TE.TaskEither<Error, A>

export class Drive {
    private cache: Cache
    private api: DriveApi

    constructor(
        api: DriveApi,
        cache: Cache = Cache.create(),
    ) {
        this.cache = cache
        this.api = api
    }

    // public getFile = (path: string) => {

    // }

    // private getItemInFolderByName = (itemName: string, parentFolderId: string) => {
    //     return this.getItemInFolderByFunc(_ => _.name == itemName, parentFolderId)
    // }

    // private getItemInFolderByFunc = (f: (item: DriveChildrenItem) => boolean, parentFolderId: string): TE.TaskEither<Error, {
    //     readonly parent: DriveDetailsFolder;
    //     readonly item: DriveChildrenItem;
    // }> => {
    //     return pipe(
    //         TE.Do,
    //         TE.bind('parent', () => pipe(
    //             this.api.retrieveItemDetailsInFolder(parentFolderId),
    //             // TE.chain(TE.fromOption(() => error(`folder with id ${parentFolderId} was not found`))))
    //         )),
    //         TE.bind('item', ({ parent }) => pipe(
    //             TE.of(parent),
    //             TE.map(flow(_ => _.items, A.findFirst(f))),
    //             TE.chain(TE.fromOption(() => error(`item was not found in ${parentFolderId}`)))
    //         ))
    //     )
    // }

    public getRoot = (): TE.TaskEither<Error, DriveDetailsRoot> => {
        return pipe(
            this.api.retrieveItemDetailsInFolders([rootDrivewsid]),
            TE.map(ds => ds[0]),
            TE.filterOrElseW(isRootDetails, () => error(`invalid root details`)),
        )
    }

    private cachedRetrieveItemDetailsInFolder = (drivewsid: string) => {
        return pipe(
            this.cache.getById(drivewsid),
            O.fold(
                () => this.api.retrieveItemDetailsInFolder(drivewsid),
                flow(
                    TE.of,
                    TE.filterOrElse(
                        isFolderLikeCacheEntity, () => error(`${drivewsid} is not a folder`)),
                    TE.chain(_ => _.hasDetails
                        ? TE.of(_.details)
                        : this.api.retrieveItemDetailsInFolder(drivewsid))
                )
            ),
            TE.chainFirst(parent => this.cachePutDetails(parent)),
        )
    }

    private fetchItemIdByFunc = <T>(f: (v: T) => (item: DriveChildrenItem) => boolean) => (parentId: TE.TaskEither<Error, string>, itemName: T): TE.TaskEither<Error, {
        item: DriveChildrenItem,
        parent: DriveDetails
    }> => pipe(
        TE.Do,
        TE.bind('parentId', () => parentId),
        TE.bind('parent', ({ parentId }) => this.cachedRetrieveItemDetailsInFolder(parentId)),
        TE.bind('item', ({ parent, parentId }) => pipe(
            parent.items,
            A.findFirst(f(itemName)),
            TE.fromOption(() => error(`item "${itemName}" was not found in "${parent.name}" (${parentId})`))
        )),
        // TE.filterOrElse(({ item }) => isFolderLikeType(item.type),
        //     ({ item }) => error(`${item.drivewsid} is not a folder`)),
        // TE.map(({ item }) => item.drivewsid),
    )

    public getDownloadUrl = (path: string) => {
        return pipe(
            this.getItem(path),
            TE.filterOrElse((_): _ is DriveChildrenItemFile => _.type === 'FILE', () => error(`item is not file`)),
            TE.chain(item => this.api.download(item.drivewsid))
        )
    }

    public getItem = (path: string) => {
        const [_, ...parsedPath] = parsePath(path)
        logger.info(parsedPath)
        return pipe(
            parsedPath,
            A.reduce(TE.of(rootDrivewsid),
                flow(
                    this.fetchItemIdByFunc(itemName => item => item.name === itemName),
                    TE.map(({ item }) => item.drivewsid),
                )),
            TE.chain(flow(this.cache.getById, TE.fromOption(() => error(`missing in cache`)))),
            TE.map(entityContent)
            // TE.chainFirstW(this.cachePutDetails)
        )
    }

    public getFolder = (path: string): TE.TaskEither<Error, DriveDetails> => {
        const [_, ...parsedPath] = parsePath(path)
        logger.info(parsedPath)
        return pipe(
            parsedPath,
            A.reduce(TE.of(rootDrivewsid),
                flow(
                    this.fetchItemIdByFunc(itemName => item => item.name === itemName),
                    TE.filterOrElse(({ item }) => isFolderLikeType(item.type),
                        ({ item }) => error(`${item.drivewsid} is not a folder`)),
                    TE.map(({ item }) => item.drivewsid),
                )),
            TE.chain(this.cachedRetrieveItemDetailsInFolder),
            TE.chainFirstW(this.cachePutDetails)
        )
    }

    private cachePutDetails = (details: DriveDetails): TE.TaskEither<Error, void> => {
        return pipe(
            this.cache.putDetails(details),
            TE.fromEither,
            TE.chainW(this.cacheSet)
        )
    }

    private cacheSet = (cache: Cache): TE.TaskEither<never, void> => {
        return TE.fromTask(async () => { this.cache = cache })
    }

    public cacheGet = () => {
        return this.cache
    }
}