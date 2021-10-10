import assert from 'assert'
import { Command } from 'commander'
import { pipe } from 'fp-ts/lib/function'
import * as TE from 'fp-ts/lib/TaskEither'
import { cliAction } from './cli/cliAction'
import { defaultCacheFile, defaultSessionFile } from './config'
import { displayItem } from './icloud/drive/helpers'
import { consumeStream } from './icloud/drive/requests/download'
import { logger } from './lib/logging'


const listUnixPath = ({
    sessionFile = defaultSessionFile,
    cacheFile = defaultCacheFile,
    path = '/',
    raw = false
} = {}): TE.TaskEither<Error, unknown> => {
    return cliAction(({ drive }) => pipe(
        drive.getFolder(path),
        TE.map(result => raw
            ? result
            : ({
                folder: result.name,
                items: result.items.map(displayItem)
            }))),
        { sessionFile, cacheFile })
}

const mkdir = (
    path: string,
    {
        sessionFile = defaultSessionFile,
        cacheFile = defaultCacheFile,
    } = {}): TE.TaskEither<Error, unknown> => {

    return cliAction(({ drive }) => drive.createFolder(path), { sessionFile, cacheFile })
}

const cat = (
    path: string,
    {
        sessionFile = defaultSessionFile,
        cacheFile = defaultCacheFile,
    } = {}): TE.TaskEither<Error, unknown> => {

    return cliAction(({ drive }) => pipe(
        drive.getDownloadStream(path),
        TE.chain(consumeStream),
        // TE.map(_ => new TextDecoder().decode(_))
    ), { sessionFile, cacheFile })
}

const rm = (
    path: string,
    {
        sessionFile = defaultSessionFile,
        cacheFile = defaultCacheFile,
    } = {}): TE.TaskEither<Error, unknown> => {

    return cliAction(({ drive }) => drive.removeItemByPath(path), { sessionFile, cacheFile })
}


const upload = (
    sourcePath: string,
    targetPath: string,
    {
        sessionFile = defaultSessionFile,
        cacheFile = defaultCacheFile,
    } = {}): TE.TaskEither<Error, unknown> => {

    return cliAction(({ drive }) => drive.upload(sourcePath, targetPath), { sessionFile, cacheFile })
}

async function main() {

    logger.debug('Drive')

    const program = new Command();

    program
        .command('ls [path]')
        .description('list')
        .action(async (path?: string) => {
            logger.info(
                await listUnixPath({ path })()
            )
        })

    program
        .command('mkdir <path>')
        .description('mkdir')
        .action(async (path: string) => {
            logger.info(
                await mkdir(path)()
            )
        })

    program
        .command('rm <path>')
        .description('rm')
        .action(async (path: string) => {
            logger.info(
                await rm(path)()
            )
        })

    program
        .command('cat <path>')
        .description('cat')
        .action(async (path: string) => {
            logger.info(
                await cat(path)()
            )
        })

    program
        .command('upload <sourcePath> <targetPath>')
        .description('rm')
        .action(async (sourcePath: string, targetPath: string) => {
            assert(sourcePath)
            assert(targetPath)

            logger.info(
                await upload(sourcePath, targetPath)()
            )
        })

    await program.parseAsync()
}

main()