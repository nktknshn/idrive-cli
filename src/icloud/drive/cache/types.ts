import { DriveDetailsFolder, DriveChildrenItemAppLibrary, DriveChildrenItemFile, DriveChildrenItemFolder, DriveDetailsRoot, DriveDetailsAppLibrary } from "../types";
import * as O from 'fp-ts/lib/Option';


export class InconsistentCache extends Error {
    static is(e: Error): e is InconsistentCache { return e instanceof InconsistentCache; }
    constructor(message?: string) { super(message); }
    static create(message?: string): InconsistentCache { return new InconsistentCache(message); }
}
export class MissingParentError extends InconsistentCache {
    constructor(message?: string) { super(message); }
    static create(message?: string): MissingParentError { return new MissingParentError(message); }
}

type DetailsType<T extends string> = `${T}`;
type ItemType<T extends string> = `${T}`;

export class CacheEntityFolderRoot {
    readonly type = 'ROOT';
    readonly hasDetails = true;

    constructor(
        public readonly content: DriveDetailsRoot
    ) { }
}
export class CacheEntityFolderDetails {
    readonly type = 'FOLDER';
    readonly hasDetails = true;

    constructor(
        public readonly content: DriveDetailsFolder
    ) { }
}
export class CacheEntityFolderItem {
    readonly type = 'FOLDER';
    readonly hasDetails = false;

    constructor(
        public readonly content: DriveChildrenItemFolder
    ) { }
}
export class CacheEntityAppLibraryDetails {
    readonly type = 'APP_LIBRARY';
    readonly hasDetails = true;

    constructor(
        public readonly content: DriveDetailsAppLibrary
    ) { }
}
export class CacheEntityAppLibraryItem {
    readonly type = 'APP_LIBRARY';
    readonly hasDetails = false;

    constructor(
        public readonly content: DriveChildrenItemAppLibrary
    ) { }
}
export class CacheEntityFile {
    readonly type = 'FILE';
    readonly hasDetails = false;

    constructor(
        public readonly content: DriveChildrenItemFile
    ) { }
}

// interface CacheEntityFolderDetails {
//     readonly details: DriveDetailsFolder
//     readonly type: DetailsType<DriveChildrenItemFolder['type']>
//     readonly hasDetails: true
// }
// interface CacheEntityFolderItem {
//     readonly item: DriveChildrenItemFolder
//     readonly type: ItemType<DriveChildrenItemFolder['type']>
//     readonly hasDetails: false
// }
// interface CacheEntityAppLibraryDetails {
//     readonly details: DriveDetailsAppLibrary
//     readonly type: DetailsType<DriveChildrenItemAppLibrary['type']>
//     readonly hasDetails: true
// }
// interface CacheEntityAppLibraryItem {
//     readonly item: DriveChildrenItemAppLibrary
//     readonly type: ItemType<DriveChildrenItemAppLibrary['type']>
//     readonly hasDetails: false
// }
// interface CacheEntityFolderRoot {
//     readonly details: DriveDetailsRoot
//     readonly type: 'ROOT'
//     readonly hasDetails: true
// }

export type CacheEntityFolder = CacheEntityFolderRoot | CacheEntityFolderDetails | CacheEntityFolderItem;
export type CacheEntityAppLibrary = CacheEntityAppLibraryItem | CacheEntityAppLibraryDetails;

export type ICloudDriveCacheEntity = CacheEntityFolder | CacheEntityAppLibrary | CacheEntityFile;
export type ICloudDriveCacheEntityType = ICloudDriveCacheEntity['type'];

export interface ICloudDriveCache {
    readonly byDrivewsid: { readonly [drivewsid: string]: ICloudDriveCacheEntity; };
    readonly byPath: { readonly [path: string]: ICloudDriveCacheEntity; };
    readonly root: O.Option<DriveDetailsRoot>;
}
