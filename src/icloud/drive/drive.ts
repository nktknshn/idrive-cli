import { DriveChildrenItem, DriveChildrenItemFile, rootDrivewsid, isRootDetails, DriveDetailsRoot, DriveDetails, DriveChildrenItemFolder } from "./types";
import * as O from 'fp-ts/lib/Option';
import * as A from 'fp-ts/lib/Array';
import { logger } from "../../lib/logging";
import { constVoid, flow, pipe } from "fp-ts/lib/function";
import * as TE from 'fp-ts/lib/TaskEither';
import * as E from 'fp-ts/lib/Either';
import { error } from "../../lib/errors";
import { displayItem, parsePath, splitParent } from "./helpers";
import { getUrlStream } from "./requests/download";
import { Readable } from "stream";
import { DriveApi } from "./drive-api";
import { Cache, isFolderLikeCacheEntity, isFolderLikeType } from "./cache/cachef";
import { ICloudDriveCacheEntity } from "./cache/types";


export class Drive {
    private cache: Cache;
    private api: DriveApi;

    constructor(
        api: DriveApi,
        cache: Cache = Cache.create()
    ) {
        this.cache = cache;
        this.api = api;
    }

    public getRoot = (): TE.TaskEither<Error, DriveDetailsRoot> => {
        return pipe(
            this.api.retrieveItemDetailsInFolders([rootDrivewsid]),
            TE.map(ds => ds[0]),
            TE.filterOrElseW(isRootDetails, () => error(`invalid root details`))
        );
    };

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
                        ? TE.of(_.content)
                        : this.api.retrieveItemDetailsInFolder(drivewsid))
                )
            ),
            TE.chainFirst(parent => this.cachePutDetails(parent))
        );
    };

    private fetchItemByFunc = <T>(
        f: (v: T) => (item: DriveChildrenItem) => boolean
    ) => (
        parentId: TE.TaskEither<Error, string>,
        value: T
    ): TE.TaskEither<Error, {
        item: DriveChildrenItem;
        parent: DriveDetails;
    }> => pipe(
        TE.Do,
        TE.bind('parentId', () => parentId),
        TE.bind('parent', ({ parentId }) => this.cachedRetrieveItemDetailsInFolder(parentId)),
        TE.bind('item', ({ parent, parentId }) => pipe(
            parent.items,
            A.findFirst(f(value)),
            TE.fromOption(() => error(`item "${value}" was not found in "${parent.name}" (${parentId})`))
        ))
    );

    public getItem = (path: string) => {
        const [_, ...parsedPath] = parsePath(path);
        logger.info(parsedPath);

        return pipe(
            parsedPath,
            A.reduce(TE.of(rootDrivewsid),
                flow(
                    this.fetchItemByFunc(itemName => item => displayItem(item) === itemName),
                    TE.map(({ item }) => item.drivewsid)
                )),
            TE.chain(flow(this.cache.getById, TE.fromOption(() => error(`missing in cache`)))),
            TE.map(_ => _.content)
            // TE.chainFirstW(this.cachePutDetails)
        );
    };

    public getFolder = (path: string): TE.TaskEither<Error, DriveDetails> => {
        const [_, ...parsedPath] = parsePath(path);
        logger.info(parsedPath);

        return pipe(
            parsedPath,
            A.reduce(TE.of(rootDrivewsid),
                flow(
                    this.fetchItemByFunc(itemName => item => displayItem(item) === itemName),
                    TE.filterOrElse(({ item }) => isFolderLikeType(item.type),
                        ({ item }) => error(`${item.drivewsid} is not a folder`)),
                    TE.map(({ item }) => item.drivewsid)
                )),
            TE.chain(this.cachedRetrieveItemDetailsInFolder),
            TE.chainFirstW(this.cachePutDetails)
        );
    };

    public updateCachedEntityByPath = (path: string): TE.TaskEither<Error, DriveDetails> => {
        return pipe(
            this.cache.getByPath(path),
            TE.fromOption(() => error(`missing cached path ${path}`)),
            TE.chain(this.updateCachedEntity)
        )
    }

    public updateCachedEntityById = (drivewsid: string): TE.TaskEither<Error, DriveDetails> => {
        return pipe(
            this.cache.getById(drivewsid),
            TE.fromOption(() => error(`missing cached ${drivewsid}`)),
            TE.chain(this.updateCachedEntity)
        )
    }

    public updateCachedEntity = (enity: ICloudDriveCacheEntity): TE.TaskEither<Error, DriveDetails> => {
        return pipe(
            this.api.retrieveItemDetailsInFolder(
                enity.type === 'FILE'
                    ? enity.content.parentId
                    : enity.content.drivewsid),
            TE.chainFirstW(this.cachePutDetails)
        )
    }

    public createFolder = (path: string) => {
        return pipe(
            splitParent(path),
            TE.fromOption(() => error(`invalid path ${path}`)),
            TE.chain(([parentPath, dirName]) => pipe(
                TE.Do,
                TE.bind('parentPath', () => TE.of(parentPath)),
                TE.bind('dirName', () => TE.of(dirName)),
                TE.bind('parent', () => this.getFolder(parentPath)),
                TE.filterOrElse(
                    ({ parent }) => pipe(parent.items, A.findFirst(_ => _.name === dirName), O.isNone),
                    ({ parent }) => error(`${parent.name} already contains ${dirName}`)
                ),
                TE.bind('result', ({ parent, dirName }) => pipe(
                    this.api.createFolders(parent.drivewsid, [dirName])
                )),
                TE.chain(({ parent }) => pipe(
                    this.updateCachedEntityById(parent.drivewsid)
                )),
            ))
        )
    }

    public removeItemByPath = (path: string) => {
        return pipe(
            TE.Do,
            TE.bind('item', () =>
                pipe(
                    this.cache.getByPath(path),
                    TE.fromOption(() => error(`missing path ${path} in cache`))),
            ),
            TE.chainFirstW(({ item }) =>
                this.api.moveItemsToTrash([{
                    drivewsid: item.content.drivewsid, etag: item.content.etag
                }])),
            TE.chainFirstW(_ =>
                this.cacheSet(this.cache.removeByPath(path))),
            TE.chainW(({ item }) =>
                item.type !== 'ROOT'
                    ? pipe(
                        this.updateCachedEntityById(item.content.parentId),
                        TE.chain(_ => TE.of(constVoid())))
                    : TE.of(constVoid())
            ),
        )
    }

    public upload = (
        sourceFilePath: string,
        targetPath: string
    ) => {
        return pipe(
            TE.Do,
            TE.bind('parent', () => this.getFolder(targetPath)),
            TE.bind('result', ({ parent }) => this.api.upload(sourceFilePath, parent.docwsid)),
            TE.chain(_ => this.updateCachedEntityById(_.parent.drivewsid))
        )
    }

    public getDownloadUrl = (path: string) => {
        return pipe(
            this.getItem(path),
            TE.filterOrElse(
                (item): item is DriveChildrenItemFile => item.type === 'FILE',
                () => error(`item is not file`)),
            TE.chain(item => this.api.download(item.docwsid, item.zone))
        );
    };

    public getDownloadStream = (path: string): TE.TaskEither<Error, Readable> => {
        return pipe(
            this.getDownloadUrl(path),
            TE.chainW(url => getUrlStream({ client: this.api.client, url }))
        );
    };

    private cachePutDetailsM = (detailss: DriveDetails[]): TE.TaskEither<Error, void> => {
        return pipe(
            detailss,
            A.reduce(
                E.of<Error, Cache>(this.cache),
                (cache, d) => pipe(cache, E.chain(_ => _.putDetails(d)))
            ),
            TE.fromEither,
            TE.chainW(this.cacheSet)
        );
    };

    private cachePutItems = (items: DriveChildrenItemFolder[]): TE.TaskEither<Error, void> => {
        return pipe(
            items,
            A.reduce(
                E.of<Error, Cache>(this.cache),
                (cache, d) => pipe(cache, E.chain(_ => _.putItem(d)))
            ),
            TE.fromEither,
            TE.chainW(this.cacheSet)
        );
    };

    private cachePutDetails = (details: DriveDetails): TE.TaskEither<Error, void> => {
        return pipe(
            this.cache.putDetails(details),
            TE.fromEither,
            TE.chainW(this.cacheSet)
        );
    };

    private cacheSet = (cache: Cache): TE.TaskEither<never, void> => {
        return TE.fromTask(async () => { this.cache = cache; });
    };

    public cacheGet = () => {
        return this.cache;
    };
}
