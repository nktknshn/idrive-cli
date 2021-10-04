import { DriveItemFolderDetails, DriverFolderItem, Hierarchy, ItemAppLibrary, ItemFile, ItemFolder, rootDrivewsid } from "./driveResponseType";
import * as O from 'fp-ts/lib/Option'
import * as A from 'fp-ts/lib/Array'
import { hasOwnProperty } from "../../lib/util";
import { pipe } from "fp-ts/lib/function";
import path from "path";
import { logger } from "../../lib/logging";

export type ICloudDriveCacheItem = CacheItemFolder | CacheItemAppLibrary | CacheItemFile

export type ICloudDriveCacheItemType = ICloudDriveCacheItem['type']

interface CacheItemFolder {
    details?: DriveItemFolderDetails
    item?: ItemFolder
    type: 'FOLDER'
}

interface CacheItemAppLibrary {
    details?: DriveItemFolderDetails
    item?: ItemAppLibrary
    type: 'APP_LIBRARY'
}

interface CacheItemFile {
    item: ItemFile
    type: 'FILE'
}

export interface ICloudDriveCache {
    byDrivewsid: { [drivewsid: string]: ICloudDriveCacheItem }
    byPath: { [path: string]: ICloudDriveCacheItem }
    root: O.Option<DriveItemFolderDetails>,
}

export const cache = (): ICloudDriveCache => ({
    root: O.none,
    byDrivewsid: {},
    byPath: {}
})

const hierarchyToPath = (hierarchy: Hierarchy) => {
    if (hierarchy.length == 1) {
        return '/'
    }
    return hierarchy.map(_ => hasOwnProperty(_, 'etag') ? _.name : '').join('/')
}

const putRoot = (cache: ICloudDriveCache, details: DriveItemFolderDetails): ICloudDriveCache => {
    return {
        ...cache,
        root: O.some(details)
    }
}

/* const putFolderItem = (cache: ICloudDriveCache, parentPath: string, item: ItemFolder): ICloudDriveCache => {

    const itemPath = `${parentPath}/${item.name}`

    return pipe(
        cache,
        cache => ({
            ...cache,
            byDrivewsid: {
                ...cache.byDrivewsid,
                [item.drivewsid]: { item, type: item.type }
            },
            byPath: {
                ...cache.byPath,
                [itemPath]: { item, type: item.type }
            },
        })
    )
}

const getCacheItem = (cache: ICloudDriveCache, item: DriverFolderItem) => {
    const cachedItem = O.fromNullable(cache.byDrivewsid[item.drivewsid])


} */

const putItem = (cache: ICloudDriveCache, parentPath: string, item: DriverFolderItem): ICloudDriveCache => {
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

const getDetailsPath = (details: DriveItemFolderDetails): string | undefined =>
    details.drivewsid == rootDrivewsid
        ? '/'
        : details.parentId === rootDrivewsid
            ? '/' + details.name
            : details.hierarchy
                ? hierarchyToPath(details.hierarchy) + '/' + details.name
                : undefined

const getId = (item: ICloudDriveCacheItem) => {
    if('details' in item) {
        if(item.details?.drivewsid !== undefined) {
            return item.details.drivewsid
        }
    }

    return item.item?.drivewsid
}

export const getItem = (item: ICloudDriveCacheItem) => {
    return item.item ?? ('details' in item ? item.details : undefined)
}

const getPathById = (cache: ICloudDriveCache, details: DriveItemFolderDetails): string => {
    const p: Hierarchy = []
    const drivewsid = details.drivewsid

    if (drivewsid == rootDrivewsid) {
        return '/'
    }

    let parent = cache.byDrivewsid[details.parentId ?? rootDrivewsid]

    return path.normalize(
        (Object.entries(cache.byPath).find(
            ([key, value]) => getId(value) && getId(value) === getId(parent)
        )?.[0] ?? 'ERROR') + '/' + details.name
    )
    // let parent = cache.byDrivewsid[details.parentId ?? rootDrivewsid]
    // //  = cache.byDrivewsid[drivewsid]

    // while (1) {
    //     if(!parent.item && !(('details' in parent) && !parent.details)) {
    //         break
    //     }

    //     const parentDetails = ('details' in parent ? parent.details : parent.item)

    //     p.push({
    //         drivewsid,
    //         etag: parentDetails?.etag!,
    //         name: parentDetails?.name!
    //     })

    //     parent = cache.byDrivewsid[parent.item?.parentId ?? rootDrivewsid]

    //     if (parent.item?.drivewsid === rootDrivewsid) {
    //         p.push({ drivewsid: rootDrivewsid })
    //         return hierarchyToPath(p.reverse())
    //     }

    // }

    // return hierarchyToPath(p.reverse())
}

const putFolder = (cache: ICloudDriveCache, details: DriveItemFolderDetails): ICloudDriveCache => {

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

export const put = (cache: ICloudDriveCache, details: DriveItemFolderDetails): ICloudDriveCache => {
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

