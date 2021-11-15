/* import { Command } from 'commander'
// import assert, { AssertionError } from 'assert'
import { identity, pipe } from 'fp-ts/lib/function'
import * as TE from 'fp-ts/lib/TaskEither'
import { Readable, Writable } from 'stream'
import { v2 } from 'webdav-server'
import { defaultCacheFile, defaultPort, defaultSessionFile } from './config'
import { readAccountData } from './icloud/authorization/validate'
import * as C from './icloud/drive/cache/cachef'
import { ICloudDriveCacheEntity } from './icloud/drive/cache/types'
import * as D from './icloud/drive/drive'
import * as DriveApi from './icloud/drive/drive-api'
import { fileName } from './icloud/drive/helpers'
import { DriveChildrenItemFile } from './icloud/drive/types'
import { readSessionFile } from './icloud/session/session-file'
import { err } from './lib/errors'
import { logger } from './lib/logging'

interface SerializedFileSystem {
  drive: D.Drive
  props: v2.IPropertyManager
}

class ICloudFileSystemSerializer implements v2.FileSystemSerializer {
  uid() {
    return 'ICloudFileSystemSerializer_1.0.0'
  }

  serialize(
    fs: ICloudFileSystem,
    callback: v2.ReturnCallback<SerializedFileSystem>,
  ) {
    callback(undefined, {
      drive: fs.drive,
      props: fs.props,
    })
  }

  unserialize(
    serializedData: SerializedFileSystem,
    callback: v2.ReturnCallback<ICloudFileSystem>,
  ) {
    const fs = new ICloudFileSystem(serializedData.drive)
    fs.props = new v2.LocalPropertyManager(serializedData.props)
    callback(undefined, fs)
  }
}

const ensureDate = (input: Date | string) => {
  if (typeof input === 'string') {
    return new Date(input)
  }

  return input
}

const getDavType = (t: ICloudDriveCacheEntity['type']) =>
  t === 'FILE' ? v2.ResourceType.File : v2.ResourceType.Directory

class ICloudFileSystem extends v2.FileSystem {
  props: v2.IPropertyManager
  locks: v2.ILockManager
  drive: D.Drive
  // session: ICloudSessionValidated
  // cache: C.Cache

  constructor(
    // session: ICloudSessionValidated
    drive: D.Drive,
  ) {
    super(new ICloudFileSystemSerializer())
    // super(new WebFileSystemSerializer());

    this.props = new v2.LocalPropertyManager()
    this.locks = new v2.LocalLockManager()
    this.drive = drive
    // this.session = session
    // this.cache = C.Cache.create()
  }

  _propertyManager(
    path: v2.Path,
    info: v2.PropertyManagerInfo,
    callback: v2.ReturnCallback<v2.IPropertyManager>,
  ): void {
    callback(undefined, this.props)
  }

  _lockManager(
    path: v2.Path,
    info: v2.LockManagerInfo,
    callback: v2.ReturnCallback<v2.ILockManager>,
  ): void {
    callback(undefined, this.locks)
  }

  _creationDate(
    path: v2.Path,
    info: v2.CreationDateInfo,
    callback: v2.ReturnCallback<number>,
  ) {
    logger.info(`_creationDate(${path})`)

    pipe(
      this.drive.getItemByPath(path.toString()),
      TE.fold(
        (e) =>
          async () => {
            callback(err(`Error: ${e.message}`), undefined)
          },
        (detals) =>
          async () => {
            callback(undefined, ensureDate(detals.dateCreated).getTime())
          },
      ),
    )()
  }

  _lastModifiedDate(
    path: v2.Path,
    info: v2.LastModifiedDateInfo,
    callback: v2.ReturnCallback<number>,
  ) {
    logger.info(`_creationDate(${path})`)

    pipe(
      this.drive.getItemByPath(path.toString()),
      TE.fold(
        (e) =>
          async () => {
            callback(err(`Error: ${e.message}`), undefined)
          },
        (detals) =>
          async () => {
            callback(
              undefined,
              ensureDate(
                detals.type === 'FILE' ? detals.dateModified : detals.dateCreated,
              ).getTime(),
            )
          },
      ),
    )()
  }

  _type(
    path: v2.Path,
    info: v2.TypeInfo,
    callback: v2.ReturnCallback<v2.ResourceType>,
  ): void {
    logger.info(`_type(${path})`)
    pipe(
      this.drive.getItemByPath(path.toString()),
      TE.fold(
        (e) =>
          async () => {
            callback(err(`Error: ${e.message}`), undefined)
          },
        (detals) =>
          async () => {
            callback(undefined, getDavType(detals.type))
          },
      ),
    )()
  }

  _readDir(
    path: v2.Path,
    ctx: v2.ReadDirInfo,
    callback: v2.ReturnCallback<string[] | v2.Path[]>,
  ) {
    logger.info(`_readDir(${path.toString()})`)
    pipe(
      this.drive.getFolderByPath(path.toString()),
      TE.fold(
        (e) =>
          async () => {
            callback(err(`Error: ${e.message}`), undefined)
          },
        (detals) =>
          async () => {
            callback(undefined, detals.items.map(fileName))
          },
      ),
    )()
  }

  _size(path: v2.Path, ctx: v2.SizeInfo, callback: v2.ReturnCallback<number>) {
    logger.info(`_size(${path.toString()})`)
    pipe(
      this.drive.getItemByPath(path.toString()),
      TE.filterOrElse(
        (_): _ is DriveChildrenItemFile => _.type === 'FILE',
        () => err(`item is not file`),
      ),
      TE.fold(
        (e) =>
          async () => {
            callback(err(`Error: ${e.message}`), undefined)
          },
        (detals) =>
          async () => {
            callback(undefined, detals.size)
          },
      ),
    )()
  }

  _etag(path: v2.Path, ctx: v2.ETagInfo, callback: v2.ReturnCallback<string>) {
    logger.info(`_etag(${path.toString()})`)
    pipe(
      this.drive.getItemByPath(path.toString()),
      // TE.filterOrElse((_): _ is DriveChildrenItemFile => _.type === 'FILE', () => error(`item is not file`)),
      TE.fold(
        (e) =>
          async () => {
            callback(err(`Error: ${e.message}`), undefined)
          },
        (detals) =>
          async () => {
            callback(undefined, detals.etag)
          },
      ),
    )()
  }

  _openReadStream(
    path: v2.Path,
    ctx: v2.OpenReadStreamInfo,
    callback: v2.ReturnCallback<Readable>,
  ) {
    logger.info(`_openReadStream(${path.toString()})`)
    pipe(
      this.drive.getDownloadStream(path.toString()),
      TE.fold(
        (e) =>
          async () => {
            callback(err(`Error: ${e.message}`), undefined)
          },
        (data) =>
          async () => {
            callback(undefined, data as Readable)
          },
      ),
    )()
  }

  _openWriteStream(
    path: v2.Path,
    ctx: v2.OpenWriteStreamInfo,
    callback: v2.ReturnCallback<Writable>,
  ) {
    logger.info(`_openWriteStream(${path.toString()})`)
  }

  _create(path: v2.Path, ctx: v2.CreateInfo, callback: v2.SimpleCallback) {
    logger.info(`_create(${path.toString()})`)

    if (ctx.type.isFile) {
      return callback()
      // return callback(error(`File creation is not supported`))
    }
    else {
      pipe(
        this.drive.createFolder(path.toString()),
        TE.fold(
          (e) =>
            async () => {
              callback(err(`Error: ${e.message}`))
            },
          (data) =>
            async () => {
              callback()
            },
        ),
      )()
    }
  }

  _delete(path: v2.Path, ctx: v2.DeleteInfo, callback: v2.SimpleCallback) {
    logger.info(`_delete(${path.toString()})`)

    pipe(
      this.drive.removeItemByPath(path.toString()),
      TE.fold(
        (e) =>
          async () => {
            callback(err(`Error: ${e.message}`))
          },
        (data) =>
          async () => {
            callback()
          },
      ),
    )()
  }
}

const run = ({
  sessionFile = defaultSessionFile,
  cacheFile = defaultCacheFile,
  port = defaultPort,
} = {}) => {
  const server = new v2.WebDAVServer({})

  return pipe(
    TE.Do,
    TE.bind('session', () => readSessionFile(sessionFile)),
    TE.bind('accountData', () => readAccountData(`${sessionFile}-accountData`)),
    TE.bind('api', (validatedSession) => TE.of(new DriveApi.DriveApi(validatedSession))),
    TE.bindW('drive', ({ api }) =>
      pipe(
        C.Cache.tryReadFromFile(cacheFile),
        TE.map(C.Cache.create),
        TE.orElseW((e) => TE.of(C.Cache.create())),
        TE.chain((cache) => TE.of(new D.Drive(api, cache))),
      )),
    TE.bind('fs', ({ drive }) => TE.of(new ICloudFileSystem(drive))),
    TE.chainW(({ fs }) =>
      TE.tryCatch(
        () => server.setFileSystemAsync('/', fs),
        (e) => err(`Error mounting fs: ${e}`),
      )
    ),
    TE.filterOrElse(identity, () => err('setFileSystemAsync returned false')),
    TE.chain(() => TE.fromTask(() => server.startAsync(port))),
  )
}

async function main() {
  const program = new Command()

  program
    .command('run')
    .description('run')
    .action(async () => {
      logger.debug(await run()())
    })

  await program.parseAsync()
}

main()
 */
