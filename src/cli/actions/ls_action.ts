import assert from 'assert'
import { ord, string } from 'fp-ts'
import * as A from 'fp-ts/lib/Array'
import * as B from 'fp-ts/lib/boolean'
import * as E from 'fp-ts/lib/Either'
import { apply, constant, constVoid, flow, identity, pipe } from 'fp-ts/lib/function'
import * as O from 'fp-ts/lib/Option'
import * as Ord from 'fp-ts/lib/Ord'
import { not } from 'fp-ts/lib/Refinement'
import * as SRTE from 'fp-ts/lib/StateReaderTaskEither'
import * as TE from 'fp-ts/lib/TaskEither'
import { fst, snd } from 'fp-ts/lib/Tuple'
import Path from 'path'
import { Cache } from '../../icloud/drive/cache/Cache'
import { isFolderLikeCacheEntity, isFolderLikeType } from '../../icloud/drive/cache/cachef'
import { showGetByPathResult, target } from '../../icloud/drive/cache/GetByPathResultValid'
import { CacheEntity, CacheEntityFile, CacheEntityFolderLike } from '../../icloud/drive/cache/types'
import { DriveApi } from '../../icloud/drive/drive-api'
import { lss } from '../../icloud/drive/drivef/lss'
import { lsss } from '../../icloud/drive/drivef/lsss'
import * as DF from '../../icloud/drive/fdrive'
import { fileName } from '../../icloud/drive/helpers'
import {
  Details,
  DriveChildrenItem,
  DriveChildrenItemFile,
  isDetails,
  isFileItem,
  isFolderLike,
  isRootDetails,
  RecursiveFolder,
} from '../../icloud/drive/types'
import { logger, logReturn, logReturnAs } from '../../lib/logging'
import { cliAction } from '../cli-action'
import { Env } from '../types'
import {
  compareDriveDetailsWithHierarchy,
  compareHierarchies,
  compareItemWithHierarchy,
  normalizePath,
} from './helpers'

type Output = string
type ErrorOutput = Error

const joinWithPath = (path: string) =>
  (name: string) =>
    pipe(
      Path.join('/', path, name),
      Path.normalize,
    )

const showFilename = (item: DriveChildrenItem | Details) =>
  item.type === 'FILE'
    ? fileName(item)
    : isDetails(item) && isRootDetails(item)
    ? '/'
    : `${fileName(item)}/`

const formatDate = (date: Date | string) =>
  pipe(
    typeof date === 'string' ? new Date(date) : date,
    date =>
      [
        date.toDateString().slice(4),
        date.toTimeString().substr(0, 5),
      ].join(' '),
  )

type OutputGenerator = Generator<string, void, unknown>

const showItemRow = ({ showDrivewsid = false, showDocwsid = false } = {}) =>
  (item: DriveChildrenItem) =>
    item.type === 'FILE'
      ? [
        item.etag,
        formatDate(item.dateModified),
        ...[showDrivewsid ? [item.drivewsid] : []],
        ...[showDocwsid ? [item.docwsid] : []],
        item.size,
        fileName(item),
      ]
        .join(`\t`)
      : [
        item.etag,
        formatDate(item.dateCreated),
        ...[showDrivewsid ? [item.drivewsid] : []],
        ...[showDocwsid ? [item.docwsid] : []],
        item.type,
        fileName(item) + '/',
      ]
        .join(`\t`)

const showWithFullPath = (path: string) => flow(showFilename, joinWithPath(path))

const showRaw = (result: Details | DriveChildrenItem) => JSON.stringify(result)

export const showFileInfo = ({ showDrivewsid = false, showDocwsid = false } = {}) =>
  (result: DriveChildrenItemFile) =>
    [
      ['name', showFilename(result)],
      ['size', result.size],
      ['dateCreated', formatDate(result.dateCreated)],
      ['dateChanged', formatDate(result.dateChanged)],
      ['dateModified', formatDate(result.dateModified)],
      ['drivewsid', result.drivewsid],
      ['docwsid', result.docwsid],
      ['etag', result.etag],
      ['parentId', result.parentId],
      ...[showDrivewsid ? [['drivewsid', result.drivewsid]] : []],
      ...[showDocwsid ? [['docwsid', result.docwsid]] : []],
    ]
      .map(_ => _.join(':\t'))
      .join('\n')

export const showFolderInfo = ({ showDrivewsid = false, showDocwsid = false } = {}) =>
  (result: Details) =>
    pipe(
      [
        ['name', showFilename(result)],
        ['dateCreated', formatDate(result.dateCreated)],
        ['drivewsid', result.drivewsid],
        ['docwsid', result.docwsid],
        ['etag', result.etag],
        !!result.extension && ['extension', result.extension],
        !isRootDetails(result) && ['parentId', result.parentId],
        // ['extensions', result.type === 'APP_LIBRARY' ? result.supportedExtensions : ''],
        // ['types', result.type === 'APP_LIBRARY' ? result.supportedTypes : ''],
        [],
        // ...[showDrivewsid ? [['drivewsid', result.drivewsid]] : []],
        // ...[showDocwsid ? [['docwsid', result.docwsid]] : []],
      ],
      A.filter(not(<T>(v: T | false): v is false => !v)),
      A.map(_ => _.join(':\t')),
    ).join('\n')

const ordByType = Ord.contramap((d: DriveChildrenItem) => d.type)(ord.reverse(string.Ord))
const ordByName = Ord.contramap((d: DriveChildrenItem) => d.name)(string.Ord)

export const showDetailsInfo = (
  { fullPath, path, showDrivewsid = false, showDocwsid = false, printFolderInfo = false }: {
    showDrivewsid?: boolean
    showDocwsid?: boolean
    printFolderInfo?: boolean
    fullPath: boolean
    path: string
  },
) =>
  (details: Details) =>
    string.Monoid.concat(
      pipe(
        details,
        O.fromPredicate(() => printFolderInfo),
        O.map(showFolderInfo({ showDrivewsid, showDocwsid })),
        O.fold(constant(string.empty), identity),
      ),
      pipe(
        details.items,
        A.sortBy([ordByType, ordByName]),
        A.map(fullPath ? showWithFullPath(path) : showItemRow({ showDrivewsid, showDocwsid })),
        _ => _.join('\n'),
      ),
    )

// const showArray
const nSymbols = (n: number, s: string) => {
  const res = []

  for (let i = 0; i < n; i++) {
    res.push(s)
  }

  return res.join('')
}

const showColumn = ({ prefix = '' }) =>
  (...strings: string[]) =>
    pipe(
      strings,
      A.map(s => string.Monoid.concat(prefix, s)),
      _ => _.join('\n'),
    )

const showRow = (delimeter = ' ') =>
  (...strings: string[]) =>
    pipe(
      strings,
      _ => _.join(delimeter),
    )

const newLine = '\n'

const prependStrings = (s: string) => (a: string[]) => a.map(_ => s + _)

const showRecursive = ({ ident = 0 }) =>
  (folder: RecursiveFolder): string => {
    const folderName = showFilename(folder.details)

    const fileNames = pipe(
      folder.details.items,
      A.filter(isFileItem),
      A.map(showFilename),
    )

    const identStr = nSymbols(ident, '  ')

    const rows = folder.deep
      ? pipe(
        folder.children,
        A.map(showRecursive({ ident: ident + 1 })),
        a => [...a, ...prependStrings(identStr + '  ')(fileNames)],
        A.prepend(identStr + folderName),
      )
      : [identStr + folderName + ' ...']

    return rows.join('\n')
  }

export const listUnixPath = (
  { sessionFile, cacheFile, paths, raw, noCache, fullPath, recursive, depth, listInfo, update }: Env & {
    recursive: boolean
    paths: string[]
    fullPath: boolean
    listInfo: boolean
    update: boolean
    depth: number
  },
): TE.TaskEither<ErrorOutput, Output> => {
  if (recursive) {
    return cliAction(
      { sessionFile, cacheFile, noCache },
      ({ cache, api }) =>
        pipe(
          DF.getFolderRecursive(paths[0], depth)(cache)(api),
          noCache
            ? TE.chainFirst(() => TE.of(constVoid()))
            : TE.chainFirst(([item, cache]) => Cache.trySaveFile(cache, cacheFile)),
          TE.map(([v, cache]) => raw ? JSON.stringify(v) : showRecursive({})(v)),
        ),
    )
  }

  const opts = { showDocwsid: false, showDrivewsid: listInfo }
  const npaths = paths.map(normalizePath)

  assert(A.isNonEmpty(npaths))

  return cliAction(
    { sessionFile, cacheFile, noCache },
    ({ cache, api }) => {
      const res = pipe(
        lsss(npaths),
        DF.saveCacheFirst(cacheFile),
        SRTE.map(
          flow(
            A.zip(npaths),
            A.map(([result, path]) => {
              if (result.valid) {
                return pipe(
                  target(result),
                  item =>
                    isDetails(item)
                      ? showDetailsInfo({ path, fullPath, printFolderInfo: true, ...opts })(item)
                      : showFileInfo({ ...opts })(item),
                )
                // return showGetByPathResult(result)
              }
              return showGetByPathResult(result)
            } // isFolderDetails(item)
              //   ? showDetailsInfo({ path, fullPath, printFolderInfo: true, ...opts })(item)
              //   : showFileInfo({ ...opts })(item)
            ),
            _ => _.join('\n\n'),
          ),
        ),
        apply(cache),
        apply(api),
        TE.map(fst),
      )

      return res
    },
  )
}
