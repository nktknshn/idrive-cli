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
import { getUnixPath } from './icloud/drive/getUnixPath'
import { parsePath } from './icloud/drive/helpers';
import * as TE from 'fp-ts/lib/TaskEither'
import * as T from 'fp-ts/lib/Task'
import * as E from 'fp-ts/lib/Either'
import * as O from 'fp-ts/lib/Option'
import { ICloudDriveCache, ICloudDriveCacheItemType } from './icloud/drive/cache';
import * as Cache from './icloud/drive/cache';
import Path from 'path'

interface SerializedFileSystem {
    session: ICloudSessionValidated,
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
                session: fs.session,
                props: fs.props
            });
    }

    unserialize(
        serializedData: SerializedFileSystem,
        callback: v2.ReturnCallback<ICloudFileSystem>
    ) {
        const fs = new ICloudFileSystem(serializedData.session)
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

const getDavType = (t: ICloudDriveCacheItemType) => t === 'FILE' ? v2.ResourceType.File : v2.ResourceType.Directory

class ICloudFileSystem extends v2.FileSystem {
    props: v2.IPropertyManager;
    locks: v2.ILockManager;
    session: ICloudSessionValidated
    cache: ICloudDriveCache

    constructor(
        session: ICloudSessionValidated
    ) {
        super(
            new ICloudFileSystemSerializer()
        )
        // super(new WebFileSystemSerializer());

        this.props = new v2.LocalPropertyManager();
        this.locks = new v2.LocalLockManager();
        this.session = session
        this.cache = Cache.cache()
    }

    _propertyManager(path: v2.Path, info: v2.PropertyManagerInfo, callback: v2.ReturnCallback<v2.IPropertyManager>): void {
        callback(undefined, this.props);
    }

    _lockManager(path: v2.Path, info: v2.LockManagerInfo, callback: v2.ReturnCallback<v2.ILockManager>): void {
        callback(undefined, this.locks);
    }

    _creationDate(path: v2.Path, info: v2.CreationDateInfo, callback: v2.ReturnCallback<number>) {
        logger.info(`_creationDate(${path})`)

        const item = this.cache.byPath[path.toString()]

        if (!item) {
            return callback(error('missing item'),undefined)
        }

        callback(undefined, Cache.getItem(item)?.dateCreated.getTime() ?? 0 / 1000)
    }

    _type(
        path: v2.Path,
        info: v2.TypeInfo,
        callback: v2.ReturnCallback<v2.ResourceType>
    ): void {
        logger.info(`_type(${path})`)

        if (path.isRoot()) {
            return callback(undefined, v2.ResourceType.Directory);
        }

        const type = this.cache.byPath[path.toString()]?.type

        if (type) {
            callback(undefined, getDavType(type));
        }
        else {
            logger.error(`missing ${path.toString()}`)
            console.log(this.cache);
            // getUnixPath(this.session, parsePath(Path.parse(path.toString()).dir))

            pipe(
                getUnixPath(this.cache, this.session, parsePath(Path.parse(path.toString()).dir)),
                T.map(E.fold(
                    (e) => {
                        logger.error(`_readDir(${e.name})`)
                        callback(e)
                    },
                    response => {
                        logger.info(`_readDir: ${response.details}`)

                        this.cache = Cache.put(this.cache, response.details)

                        console.log(this.cache);

                        callback(undefined, this.cache.byPath[path.toString()]?.type === 'FILE' ? v2.ResourceType.File : v2.ResourceType.Directory)
                    }
                ))
            )()

            callback(error(`missing ${path.toString()}`), undefined);
        }
    }

    _readDir(
        path: v2.Path, ctx: v2.ReadDirInfo, callback: v2.ReturnCallback<string[] | v2.Path[]>
    ) {
        logger.info(`_readDir(${path.toString()})`)

        const cached = Cache.getByPath(this.cache, path.toString())

        if (O.isSome(cached) && 'details' in cached.value) {
            return callback(undefined, cached.value.details?.items.map(_ => _.name) ?? ['ERROR_FILE'])
        }

        pipe(
            getUnixPath(this.cache, this.session, parsePath(path.toString())),
            T.map(E.fold(
                (e) => {
                    logger.error(`_readDir(${e.message})`)
                    callback(e)
                },
                response => {
                    logger.info(`_readDir: ${response.details}`)

                    this.cache = Cache.put(this.cache, response.details)

                    console.log(this.cache);

                    callback(undefined, response.details.items.map(_ => _.name))
                }
            ))
        )()

    }

    private setSession(
        session: ICloudSessionValidated
    ) {
        this.session = session
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
        TE.map(({ session, accountData }) => new ICloudFileSystem({ session, accountData })),
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