import { ord, string } from 'fp-ts'
import * as A from 'fp-ts/lib/Array'
import * as B from 'fp-ts/lib/boolean'
import * as E from 'fp-ts/lib/Either'
import { constant, constVoid, flow, identity, pipe } from 'fp-ts/lib/function'
import * as O from 'fp-ts/lib/Option'
import * as Ord from 'fp-ts/lib/Ord'
import * as SRTE from 'fp-ts/lib/StateReaderTaskEither'
import * as TE from 'fp-ts/lib/TaskEither'
import Path from 'path'
import { Cache } from '../../icloud/drive/cache/Cache'
import { isFolderLikeCacheEntity, isFolderLikeType } from '../../icloud/drive/cache/cachef'
import { CacheEntityFile, CacheEntityFolderLike, ICloudDriveCacheEntity } from '../../icloud/drive/cache/types'
import { DriveApi } from '../../icloud/drive/drive-api'
import { lss } from '../../icloud/drive/drivef/lss'
import * as DF from '../../icloud/drive/fdrive'
import { fileName } from '../../icloud/drive/helpers'
import {
  DriveChildrenItem,
  DriveChildrenItemFile,
  DriveDetails,
  isFileItem,
  isFolderDetails,
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

const showFilename = (item: DriveChildrenItem | DriveDetails) =>
  item.type === 'FILE'
    ? fileName(item)
    : isFolderDetails(item) && isRootDetails(item)
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
/*
const showItemRowGenerator = ({ showDrivewsid = false, showDocwsid = false } = {}) =>
  function*(item: DriveChildrenItem): OutputGenerator {
    yield item.etag
    if (item.type === 'FILE') {
      yield formatDate(item.dateModified)
      if (showDrivewsid) {
        yield item.drivewsid
      }
      if (showDocwsid) {
        yield item.docwsid
      }
      yield String(item.size)
      yield fileName(item)
    }
    else {
      yield item.etag
      yield formatDate(item.dateCreated)
      if (showDrivewsid) {
        yield item.drivewsid
      }
      if (showDocwsid) {
        yield item.docwsid
      }
      yield item.type
      yield fileName(item)
    }
  }

const showItemRow = ({ showDrivewsid = false, showDocwsid = false } = {}) =>
  showItemRowGenerator({ showDrivewsid = false, showDocwsid = false } = {}) */

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

const showRaw = (result: DriveDetails | DriveChildrenItem) => JSON.stringify(result)

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
  (result: DriveDetails) =>
    [
      ['name', showFilename(result)],
      ['dateCreated', formatDate(result.dateCreated)],
      ['drivewsid', result.drivewsid],
      ['docwsid', result.docwsid],
      ['etag', result.etag],
      ['extension', result.extension],
      ['parentId', isRootDetails(result) ? '' : result.parentId],
      [],
      // ...[showDrivewsid ? [['drivewsid', result.drivewsid]] : []],
      // ...[showDocwsid ? [['docwsid', result.docwsid]] : []],
    ]
      .map(_ => _.join(':\t'))
      .join('\n')

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
  (result: DriveDetails) =>
    string.Monoid.concat(
      pipe(
        result,
        O.fromPredicate(() => printFolderInfo),
        O.map(showFolderInfo({ showDrivewsid, showDocwsid })),
        O.fold(constant(string.empty), identity),
      ),
      pipe(
        result.items,
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
  { sessionFile, cacheFile, path, raw, noCache, fullPath, recursive, depth, listInfo, update }: Env & {
    recursive: boolean
    path: string
    fullPath: boolean
    listInfo: boolean
    update: boolean
    depth: number
  },
): TE.TaskEither<ErrorOutput, Output> => {
  if (recursive) {
    return cliAction(
      { sessionFile, cacheFile, noCache, dontSaveCache: true },
      ({ cache, api }) =>
        pipe(
          DF.getFolderRecursive(path, depth)(cache)(api),
          noCache
            ? TE.chainFirst(() => TE.of(constVoid()))
            : TE.chainFirst(([item, cache]) => Cache.trySaveFile(cache, cacheFile)),
          TE.map(([v, cache]) => raw ? JSON.stringify(v) : showRecursive({})(v)),
          // TE.map(_ => JSON.stringify(_)),
          // TE.map(raw ? showRaw : showDetails({ path, fullPath })),
        ),
    )
  }

  const opts = { showDocwsid: false, showDrivewsid: listInfo }

  return cliAction(
    { sessionFile, cacheFile, noCache, dontSaveCache: true },
    ({ cache, api }) => {
      const res = pipe(
        lss([normalizePath(path)]),
        f => f(cache)(api),
        !noCache
          ? TE.chainFirst(([items, cache]) => Cache.trySaveFile(cache, cacheFile))
          : TE.chainFirst(() => TE.of(constVoid())),
        TE.map(([items, cache]) =>
          pipe(
            items,
            A.map(item =>
              isFolderDetails(item)
                ? showDetailsInfo({ path, fullPath, printFolderInfo: true, ...opts })(item)
                : showFileInfo({ ...opts })(item)
            ),
            _ => _.join('\n\n'),
          )
        ),
      )

      return res
    },
  )
}
