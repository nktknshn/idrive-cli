import { v2 } from 'webdav-server'
import { ICloudSessionValidated } from './icloud/authorization/authorize';
import { Command } from 'commander'
// import assert, { AssertionError } from 'assert'
import { identity, pipe } from 'fp-ts/lib/function'
import { defaultSessionFile } from './config'
import { readAccountData } from './icloud/authorization/validate'
import { InvalidGlobalSessionResponse, retrieveItemDetailsInFolders } from './icloud/drive/retrieveItemDetailsInFolders'
import { tryReadSessionFile } from './icloud/session/session-file'
import { fetchClient } from './lib/fetch-client'
import { logger } from './lib/logging'
import { error } from './lib/errors';
import { ICloudSessionState } from './icloud/session/session';
import { parsePath } from './icloud/drive/helpers';
import * as TE from 'fp-ts/lib/TaskEither'
import * as T from 'fp-ts/lib/Task'
import * as E from 'fp-ts/lib/Either'
import * as O from 'fp-ts/lib/Option'
import { ICloudDriveCache, ICloudDriveCacheEntity } from './icloud/drive/cache/cachef';
import * as C from './icloud/drive/cache/cachef';
import Path from 'path'
import { DriveChildrenItemFile } from './icloud/drive/types';
import { Readable } from 'stream';

interface SerializedFileSystem {
    drive: C.Drive,
    props: v2.IPropertyManager
}

class ICloudFileSystemSerializer implements v2.FileSystemSerializer {
    uid() {
        return 'ICloudFileSystemSerializer_1.0.0'
    }

    serialize(
        fs: ICloudFileSystem,
        callback: v2.ReturnCallback<SerializedFileSystem>
    ) {
        callback(undefined,
            {
                drive: fs.drive,
                props: fs.props
            });
    }

    unserialize(
        serializedData: SerializedFileSystem,
        callback: v2.ReturnCallback<ICloudFileSystem>
    ) {
        const fs = new ICloudFileSystem(serializedData.drive)
        fs.props = new v2.LocalPropertyManager(serializedData.props);
        callback(undefined, fs)
    }
}

class ICloudApi {
    private session: ICloudSessionState

    constructor(
        session: ICloudSessionState
    ) {
        this.session = session
    }
}

const ensureDate = (input: Date | string) => {
    if (typeof input === 'string') {
        return new Date(input)
    }

    return input
}

const getDavType = (t: ICloudDriveCacheEntity['type']) => t === 'FILE' ? v2.ResourceType.File : v2.ResourceType.Directory

class ICloudFileSystem extends v2.FileSystem {
    props: v2.IPropertyManager;
    locks: v2.ILockManager;
    drive: C.Drive
    // session: ICloudSessionValidated
    // cache: C.Cache

    constructor(
        // session: ICloudSessionValidated
        drive: C.Drive
    ) {
        super(
            new ICloudFileSystemSerializer()
        )
        // super(new WebFileSystemSerializer());

        this.props = new v2.LocalPropertyManager();
        this.locks = new v2.LocalLockManager();
        this.drive = drive
        // this.session = session
        // this.cache = C.Cache.create()
    }

    _propertyManager(path: v2.Path, info: v2.PropertyManagerInfo, callback: v2.ReturnCallback<v2.IPropertyManager>): void {
        callback(undefined, this.props);
    }

    _lockManager(path: v2.Path, info: v2.LockManagerInfo, callback: v2.ReturnCallback<v2.ILockManager>): void {
        callback(undefined, this.locks);
    }

    _creationDate(path: v2.Path, info: v2.CreationDateInfo, callback: v2.ReturnCallback<number>) {
        logger.info(`_creationDate(${path})`)

        pipe(
            this.drive.getItem(path.toString()),
            TE.fold(
                e => async () => { callback(error(`Error: ${e.message}`), undefined) },
                detals => async () => {
                    callback(undefined, ensureDate(detals.dateCreated).getTime())
                }
            )
        )()
    }

    _type(
        path: v2.Path,
        info: v2.TypeInfo,
        callback: v2.ReturnCallback<v2.ResourceType>
    ): void {
        logger.info(`_type(${path})`)
        pipe(
            this.drive.getItem(path.toString()),
            TE.fold(
                e => async () => { callback(error(`Error: ${e.message}`), undefined) },
                detals => async () => { callback(undefined, getDavType(detals.type)) }
            )
        )()
    }

    _readDir(
        path: v2.Path, ctx: v2.ReadDirInfo, callback: v2.ReturnCallback<string[] | v2.Path[]>
    ) {
        logger.info(`_readDir(${path.toString()})`)
        pipe(
            this.drive.getFolder(path.toString()),
            TE.fold(
                e => async () => { callback(error(`Error: ${e.message}`), undefined) },
                detals => async () => { callback(undefined, detals.items.map(_ => _.name)) }
            )
        )()
    }

    _size(
        path: v2.Path, ctx: v2.SizeInfo, callback: v2.ReturnCallback<number>
    ) {
        logger.info(`_size(${path.toString()})`)
        pipe(
            this.drive.getItem(path.toString()),
            TE.filterOrElse((_): _ is DriveChildrenItemFile => _.type === 'FILE', () => error(`item is not file`)),
            TE.fold(
                e => async () => { callback(error(`Error: ${e.message}`), undefined) },
                detals => async () => { callback(undefined, detals.size) }
            )
        )()
    }

    _etag(
        path: v2.Path, ctx: v2.ETagInfo, callback: v2.ReturnCallback<string>
    ) {
        logger.info(`_etag(${path.toString()})`)
        pipe(
            this.drive.getItem(path.toString()),
            TE.filterOrElse((_): _ is DriveChildrenItemFile => _.type === 'FILE', () => error(`item is not file`)),
            TE.fold(
                e => async () => { callback(error(`Error: ${e.message}`), undefined) },
                detals => async () => { callback(undefined, detals.etag) }
            )
        )()
    }

    _openReadStream(
        path: v2.Path, ctx: v2.OpenReadStreamInfo, callback: v2.ReturnCallback<Readable>
    ) {
        logger.info(`_openReadStream(${path.toString()})`)
        pipe(
            this.drive.getDownloadUrl(path.toString()),
            TE.fold(
                e => async () => { callback(error(`Error: ${e.message}`), undefined) },
                url => async () => {
                    callback(undefined, detals)
                }
            )
        )()
    }
}

const run = (
    { sessionFile = defaultSessionFile } = {}
) => {

    const server = new v2.WebDAVServer({});

    return pipe(
        TE.Do,
        TE.bind('session', () => tryReadSessionFile(sessionFile)),
        TE.bind('accountData', () => readAccountData(`${sessionFile}-accountData`)),
        TE.bind('api', validatedSession => TE.of(new C.DriveApi(validatedSession))),
        TE.bindW('drive', ({ api }) => pipe(
            C.Cache.tryReadFromFile('data/cli-drive-cache.json'),
            TE.map(C.Cache.create),
            TE.orElseW(e => TE.of(C.Cache.create())),
            TE.chain(cache => TE.of(new C.Drive(api, cache)))
        )),
        TE.map(({ drive }) => new ICloudFileSystem(drive)),
        TE.chainW(fs => TE.tryCatch(
            () => server.setFileSystemAsync('/', fs),
            e => error(`Error mounting fs: ${e}`)
        )),
        TE.filterOrElse(identity, () => error('setFileSystemAsync returned false')),
        TE.chain(() => TE.fromTask(() => server.startAsync(8899)))
    )
}

async function main() {


    const program = new Command();

    program
        .command('run')
        .description('run')
        .action(async () => {
            logger.debug(await run()())
        })

    await program.parseAsync()


}

main()