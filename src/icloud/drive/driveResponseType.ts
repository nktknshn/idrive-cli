export const rootDrivewsid = 'FOLDER::com.apple.CloudDocs::root'

export type DriverFolderItem = ItemFile | ItemFolder | ItemAppLibrary

export interface DriveItemFolderRoot {
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
    items: (ItemFile | ItemFolder | ItemAppLibrary)[];
    numberOfItems: number;
    status: string;
}

export type Hierarchy = (HierarchyItem | HierarchyItemRoot)[]

export interface DriveItemFolderDetails {
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
    items: (ItemFile | ItemFolder | ItemAppLibrary)[];
    numberOfItems: number;
    status: string;
    parentId?: string;
    hierarchy?: Hierarchy
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

export interface ItemFile {
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
}

export interface ItemFolder {
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

export interface ItemAppLibrary {
    dateCreated: Date;
    drivewsid: string;
    docwsid: string;
    zone: string;
    name: string;
    parentId: string;
    etag: string;
    type: 'APP_LIBRARY';
    // assetQuota:          number;
    // fileCount:           number;
    // shareCount:          number;
    // shareAliasCount:     number;
    // directChildrenCount: number;
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
