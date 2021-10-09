export const rootDrivewsid = 'FOLDER::com.apple.CloudDocs::root'

export type WithId = { drivewsid: string }
export type DriveDetails = DriveDetailsFolder | DriveDetailsRoot | DriveDetailsAppLibrary
export type DriveChildrenItem = DriveChildrenItemFile | DriveChildrenItemFolder | DriveChildrenItemAppLibrary

export const isRootDetails = (details: DriveDetails): details is DriveDetailsRoot => {
    return details.name === "" && details.drivewsid === rootDrivewsid
}

export interface DriveDetailsRoot {
    dateCreated: Date;
    drivewsid: typeof rootDrivewsid;
    docwsid: string;
    zone: string;
    name: "";
    etag: string;
    type: 'FOLDER';
    assetQuota: number;
    fileCount: number;
    shareCount: number;
    shareAliasCount: number;
    directChildrenCount: number;
    items: DriveChildrenItem[];
    numberOfItems: number;
    status: string;
}

export type Hierarchy = (HierarchyItem | HierarchyItemRoot)[]

export interface DriveDetailsFolder {
    dateCreated: Date;
    drivewsid: string;
    docwsid: string;
    zone: string;
    name: string;
    etag: string;
    type: 'FOLDER';
    assetQuota: number;
    fileCount: number;
    shareCount: number;
    shareAliasCount: number;
    directChildrenCount: number;
    items: DriveChildrenItem[];
    numberOfItems: number;
    status: string;
    parentId: string;
    hierarchy?: Hierarchy
    isChainedToParent?: boolean;
}

export interface DriveDetailsAppLibrary {
    dateCreated: Date;
    drivewsid: string;
    docwsid: string;
    zone: string;
    name: string;
    etag: string;
    type: 'APP_LIBRARY';
    assetQuota: number;
    fileCount: number;
    shareCount: number;
    shareAliasCount: number;
    directChildrenCount: number;
    items: DriveChildrenItem[];
    numberOfItems: number;
    status: string;
    parentId: string;
    hierarchy?: Hierarchy
    isChainedToParent?: boolean;
}

export interface DriveChildrenItemFolder {
    dateCreated: Date;
    drivewsid: string;
    docwsid: string;
    zone: string;
    name: string;
    parentId: string;
    etag: string;
    type: 'FOLDER';
    assetQuota: number;
    fileCount: number;
    shareCount: number;
    shareAliasCount: number;
    directChildrenCount: number;
    isChainedToParent?: boolean;
}

export interface HierarchyItemRoot {
    drivewsid: typeof rootDrivewsid;
}

export interface HierarchyItem {
    drivewsid: string;
    name: string;
    etag: string;
}

export interface PartialItem {
    drivewsid: string;
    docwsid: string;
    etag: string;
}

export interface DriveChildrenItemFile {
    dateCreated: Date;
    drivewsid: string;
    docwsid: string;
    zone: string;
    name: string;
    parentId: string;
    dateModified: Date;
    dateChanged: Date;
    size: number;
    etag: string;
    shortGUID: string;
    type: 'FILE';
    extension?: string
}

export interface DriveChildrenItemAppLibrary {
    dateCreated: Date;
    drivewsid: string;
    docwsid: string;
    zone: string;
    name: string;
    parentId: string;
    etag: string;
    type: 'APP_LIBRARY';
    maxDepth: string;
    icons: Icon[];
    supportedExtensions: string[];
    supportedTypes: string[];
}

export interface Icon {
    url: string;
    type: string;
    size: number;
}
