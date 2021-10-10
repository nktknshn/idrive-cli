import { DriveChildrenItem, Hierarchy, rootDrivewsid, isRootDetails, DriveDetailsRoot, DriveDetails, WithId } from "../types";
import * as O from 'fp-ts/lib/Option'
import * as R from 'fp-ts/lib/Record'
import * as A from 'fp-ts/lib/Array'
import * as E from 'fp-ts/lib/Either'
import { hasOwnProperty, isObjectWithOwnProperty } from "../../../lib/util";
import { constant, constVoid, flow, identity, pipe } from "fp-ts/lib/function";
import Path from "path";
import { fst } from "fp-ts/lib/Tuple";
import * as m from 'monocle-ts'
import { ICloudSessionState } from "../../session/session";
import * as TE from 'fp-ts/lib/TaskEither';
import { displayItem, normalizePath } from "../helpers";
import { tryReadJsonFile, TypeDecodingError } from "../../../lib/files";
import { saveJson } from "../../session/session-file";
import { ICloudDriveCache, ICloudDriveCacheEntity, CacheEntityFolder, CacheEntityAppLibrary, CacheEntityFolderRoot, CacheEntityFolderDetails, CacheEntityAppLibraryDetails, CacheEntityFile, CacheEntityFolderItem, CacheEntityAppLibraryItem, MissingParentError } from "./types";

namespace lens {
    export const root = m.Lens.fromProp<ICloudDriveCache>()('root')
    export const byPath = m.Lens.fromProp<ICloudDriveCache>()('byPath')
    export const byDrivewsid = m.Lens.fromProp<ICloudDriveCache>()('byDrivewsid')

    // export const update = byPath.compose(byDrivewsid)
}

export const cachef = (): ICloudDriveCache => ({
    byPath: {},
    byDrivewsid: {},
    root: O.none
})

const getCachedPathForId = (drivewsid: string) => (cache: ICloudDriveCache): O.Option<string> => {

    if (drivewsid === rootDrivewsid) {
        return pipe(cache.root, O.map(constant('/')))
    }

    return pipe(
        R.toArray(cache.byPath),
        A.findFirst(([path, entity]) => entity.content
            .drivewsid === drivewsid),
        O.map(fst)
    )
}

export const isFolderLikeCacheEntity = (entity: ICloudDriveCacheEntity): entity is CacheEntityFolder | CacheEntityAppLibrary => isFolderLikeType(entity.type)

export const isFolderLikeType = (type: ICloudDriveCacheEntity['type']): type is (CacheEntityFolder | CacheEntityAppLibrary)['type'] => type !== 'FILE'

const cacheEntityFromDetails = (details: DriveDetails): ICloudDriveCacheEntity =>
    isRootDetails(details)
        ? new CacheEntityFolderRoot(details)
        : details.type === 'FOLDER'
            ? new CacheEntityFolderDetails(details)
            : new CacheEntityAppLibraryDetails(details)

const cacheEntityFromItem = (item: DriveChildrenItem): ICloudDriveCacheEntity => {
    return item.type === 'FILE'
        ? new CacheEntityFile(item)
        : item.type === 'FOLDER'
            ? new CacheEntityFolderItem(item)
            : new CacheEntityAppLibraryItem(item)
}

const getById = (drivewsid: string) => (cache: ICloudDriveCache): O.Option<ICloudDriveCacheEntity> => {
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
        return cached.content.etag !== entity.content.etag
    }

    if (!cached.hasDetails && entity.hasDetails) {
        return true
    }

    return cached.content.etag !== entity.content.etag
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

const putDetails = (details: DriveDetails): ((cache: ICloudDriveCache) => E.Either<Error, ICloudDriveCache>) => {

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
            getById(entity.content.drivewsid),
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

const putItem = (item: DriveChildrenItem): ((cache: ICloudDriveCache) => E.Either<Error, ICloudDriveCache>) => {
    return cache => pipe(
        cache,
        getCachedPathForId(item.parentId),
        E.fromOption(() =>
            MissingParentError.create(`missing parent ${item.parentId} in cache`)),
        E.map(parentPath =>
            pipe(
                cache,
                lens.byPath.modify(
                    R.upsertAt(Path.join(parentPath, displayItem(item)), cacheEntityFromItem(item))),
                lens.byDrivewsid.modify(
                    R.upsertAt(item.drivewsid, cacheEntityFromItem(item)))
            )
        )
    )
}

const validateCacheJson = (json: unknown): json is ICloudDriveCache => {
    return isObjectWithOwnProperty(json, 'byPath') && hasOwnProperty(json, 'root')
}

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
            cache.cache,
            saveJson(cacheFilePath)
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

    findByPathGlob = (path: string) => {
        const npath = normalizePath(path)
        return pipe(
            this.cache.byPath,
            R.filterWithIndex((path, entity) => path == npath || path.startsWith(npath + '/')),
            R.toArray,
        )
    }

    // , includeDescendors = true
    removeByPath = (path: string) => {
        return pipe(
            this.findByPathGlob(path),
            A.reduce(this.cache, (cache, [path, entity]) => pipe(
                cache,
                lens.byPath.modify(R.deleteAt(path)),
                lens.byDrivewsid.modify(R.deleteAt(entity.content.drivewsid)),
            )),
            Cache.create
        )
    }

    static create(
        cache: ICloudDriveCache = cachef()
    ) {
        return new Cache(cache)
    }
}

type Effect<A> = TE.TaskEither<Error, A>

