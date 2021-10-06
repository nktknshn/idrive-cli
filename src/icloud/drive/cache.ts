/* import { DriveDetailsFolder, DriveChildrenItem, Hierarchy, DriveChildrenItemAppLibrary, DriveChildrenItemFile, DriveChildrenItemFolder, rootDrivewsid } from "./types";
import * as O from 'fp-ts/lib/Option'
import * as A from 'fp-ts/lib/Array'
import { hasOwnProperty } from "../../lib/util";
import { pipe } from "fp-ts/lib/function";
import path from "path";
import { logger } from "../../lib/logging";

export type ICloudDriveCacheItem = CacheItemFolder | CacheItemAppLibrary | CacheItemFile
export type ICloudDriveCacheItemType = ICloudDriveCacheItem['type']

interface CacheItemFolder {
    details?: DriveDetailsFolder
    item?: DriveChildrenItemFolder
    type: DriveChildrenItemFolder['type']
}

interface CacheItemAppLibrary {
    details?: DriveDetailsFolder
    item?: DriveChildrenItemAppLibrary
    type: DriveChildrenItemAppLibrary['type']
}

interface CacheItemFile {
    item: DriveChildrenItemFile
    type: DriveChildrenItemFile['type']
}

// export interface ICloudDriveCache {
//     byDrivewsid: { [drivewsid: string]: ICloudDriveCacheItem }
//     byPath: { [path: string]: ICloudDriveCacheItem }
//     root: O.Option<DriveItemFolderDetails>,
// }

export interface ICloudDriveCache {
    putItem(parentPath: string, item: DriveChildrenItem): ICloudDriveCache
}

export class ICloudDriveCache {
    constructor(
        // private readonly byDrivewsid: { [drivewsid: string]: ICloudDriveCacheItem } = {},
        // private readonly byPath: { [path: string]: ICloudDriveCacheItem } = {},
        // private readonly root: O.Option<DriveItemFolderDetails> = O.none,
        private readonly cache: {
            readonly byDrivewsid: { [drivewsid: string]: ICloudDriveCacheItem }
            readonly byPath: { [path: string]: ICloudDriveCacheItem }
        } = { byDrivewsid: {}, byPath: {} }
    ) {

    }

    static create() {
        return new ICloudDriveCache()
    }

    public getById = (
        drivewsid: string
    ): O.Option<ICloudDriveCacheItem> => {
        return O.fromNullable(this.cache.byDrivewsid[drivewsid])
    }

    public getByPath = (
        path: string
    ): O.Option<ICloudDriveCacheItem> => {
        return O.fromNullable(this.cache.byPath[path])
    }

    public putItem = (
        item: DriveChildrenItem,
        parentPath: string
    ): ICloudDriveCache => {

    }
}


// export const cache = (
//     byDrivewsid: { [drivewsid: string]: ICloudDriveCacheItem },
//     byPath: { [path: string]: ICloudDriveCacheItem },
//     root: O.Option<DriveItemFolderDetails>,
// ): ICloudDriveCache => ({
//     root,
//     byDrivewsid,
//     byPath,
//     putItem(parentPath, item) { return putItem(this, parentPath, item) },

// })

const hierarchyToPath = (hierarchy: Hierarchy) => {
    if (hierarchy.length == 1) {
        return '/'
    }
    return hierarchy.map(_ => hasOwnProperty(_, 'etag') ? _.name : '').join('/')
}

const putRoot = (cache: ICloudDriveCache, details: DriveDetailsFolder): ICloudDriveCache => {
    return {
        ...cache,
        root: O.some(details)
    }
}

const putItem = (
    cache: ICloudDriveCache,
    parentPath: string,
    item: DriveChildrenItem
): ICloudDriveCache => {

    const itemPath = path.normalize(`${parentPath}/${item.name}`)
    const cachedItem: ICloudDriveCacheItem | undefined = cache.byDrivewsid[item.drivewsid]
    const newCacheItem = cachedItem && 'details' in cachedItem && cachedItem.details?.etag === item.etag
        ? cachedItem
        : { item, type: item.type } as ICloudDriveCacheItem

    return pipe(
        cache,
        cache => ({
            ...cache,
            byDrivewsid: {
                ...cache.byDrivewsid,
                [item.drivewsid]: newCacheItem
            },
            byPath: {
                ...cache.byPath,
                [itemPath]: newCacheItem
            },
        })
    )
}


const getId = (item: ICloudDriveCacheItem) => {
    if ('details' in item) {
        if (item.details?.drivewsid !== undefined) {
            return item.details.drivewsid
        }
    }

    return item.item?.drivewsid
}

export const getItem = (item: ICloudDriveCacheItem) => {
    return item.item ?? ('details' in item ? item.details : undefined)
}

const getPathById = (cache: ICloudDriveCache, details: DriveDetailsFolder): string => {
    if (details.drivewsid == rootDrivewsid) {
        return '/'
    }

    let parent = cache.byDrivewsid[details.parentId!]

    return path.normalize(
        (Object.entries(cache.byPath).find(
            ([key, value]) => getId(value) && getId(value) === getId(parent)
        )?.[0] ?? 'ERROR') + '/' + details.name
    )
}

const putFolder = (cache: ICloudDriveCache, details: DriveDetailsFolder): ICloudDriveCache => {

    // logger.info(
    //     cache
    // )

    const detailsPath = getPathById(cache, details)

    return pipe(
        cache,
        cache => details.items.reduce((acc, cur) => putItem(acc, detailsPath, cur), cache),
        cache => ({
            ...cache,
            byDrivewsid: {
                ...cache.byDrivewsid,
                [details.drivewsid]: { details, type: 'FOLDER' }
            },
            byPath: {
                ...cache.byPath,
                [detailsPath]: { details, type: 'FOLDER' }
            },
        })
    )
}

export const put = (cache: ICloudDriveCache, details: DriveDetailsFolder): ICloudDriveCache => {
    if (details.drivewsid == rootDrivewsid) {
        return pipe(
            cache,
            cache => putRoot(cache, details),
            cache => putFolder(cache, details),
        )
    }

    return putFolder(cache, details)
}


export const getByPath = (cache: ICloudDriveCache, path: string): O.Option<ICloudDriveCacheItem> => {
    return O.fromNullable(cache.byPath[path])
}

 */