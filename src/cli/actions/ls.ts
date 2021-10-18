import { ord, string } from 'fp-ts'
import * as A from 'fp-ts/lib/Array'
import { constant, flow, identity, pipe } from 'fp-ts/lib/function'
import { range } from 'fp-ts/lib/NonEmptyArray'
import * as O from 'fp-ts/lib/Option'
import * as Ord from 'fp-ts/lib/Ord'
import * as TE from 'fp-ts/lib/TaskEither'
import Path from 'path'
import { isFolderLikeType } from '../../icloud/drive/cache/cachef'
import { fileName } from '../../icloud/drive/helpers'
import {
  DriveChildrenItem,
  DriveChildrenItemFile,
  DriveDetails,
  isFolderDetails,
  isFolderLike,
  isRootDetails,
  RecursiveFolder,
} from '../../icloud/drive/types'
import { cliAction } from '../cli-action'
import { Env } from '../types'

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

const showFileInfo = ({ showDrivewsid = false, showDocwsid = false } = {}) =>
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

const showFolderInfo = ({ showDrivewsid = false, showDocwsid = false } = {}) =>
  (result: DriveDetails) =>
    [
      ['name', showFilename(result)],
      ['dateCreated', formatDate(result.dateCreated)],
      ['drivewsid', result.drivewsid],
      ['docwsid', result.docwsid],
      ['etag', result.etag],
      ['parentId', isRootDetails(result) ? '' : result.parentId],
      ...[showDrivewsid ? [['drivewsid', result.drivewsid]] : []],
      ...[showDocwsid ? [['docwsid', result.docwsid]] : []],
    ]
      .map(_ => _.join(':\t'))
      .join('\n')

const ordByType = Ord.contramap((d: DriveChildrenItem) => d.type)(ord.reverse(string.Ord))
const ordByName = Ord.contramap((d: DriveChildrenItem) => d.name)(string.Ord)

const showDetailsInfo = (
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
const nSymbols = (n: number, s: string) => range(0, n).map(_ => s).join('')

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

const showRecursive = (
  folder: RecursiveFolder,
  ident = 0,
): string => {
  return showColumn({
    prefix: nSymbols(ident, ' '),
  })(
    fileName(folder.details),
    // newLine,
    ...pipe(
      folder.deep ? folder.children : [],
      A.map(_ => showRecursive(_, ident + 1)),
    ),
  )
}

export const listUnixPath = (
  { sessionFile, cacheFile, path, raw, noCache, fullPath, recursive, depth }: Env & {
    recursive: boolean
    path: string
    fullPath: boolean
    depth: number
  },
): TE.TaskEither<ErrorOutput, Output> => {
  if (recursive) {
    return cliAction(
      { sessionFile, cacheFile, noCache },
      ({ drive }) =>
        pipe(
          drive.getFolderRecursiveByPath2(path, { depth }),
          TE.map(v => raw ? JSON.stringify(v) : showRecursive(v)),
          // TE.map(_ => JSON.stringify(_)),
          // TE.map(raw ? showRaw : showDetails({ path, fullPath })),
        ),
    )
  }

  const opts = { showDocwsid: false, showDrivewsid: false }

  return cliAction(
    { sessionFile, cacheFile, noCache },
    ({ drive }) =>
      pipe(
        drive.getByPath(path),
        TE.map(item =>
          isFolderLike(item)
            ? showDetailsInfo({ path, fullPath, printFolderInfo: true, ...opts })(item)
            : showFileInfo({ ...opts })(item)
        ),
        // TE.map(_ => JSON.stringify(_)),
        // TE.map(raw ? showRaw : showDetails({ path, fullPath })),
      ),
  )
}
