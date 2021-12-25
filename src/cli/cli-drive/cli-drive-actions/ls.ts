import assert from 'assert'
import { ord, string } from 'fp-ts'
import * as A from 'fp-ts/lib/Array'
import { apply, constant, constVoid, flow, identity, pipe } from 'fp-ts/lib/function'
import * as O from 'fp-ts/lib/Option'
import * as Ord from 'fp-ts/lib/Ord'
import { not } from 'fp-ts/lib/Refinement'
import * as SRTE from 'fp-ts/lib/StateReaderTaskEither'
import * as TE from 'fp-ts/lib/TaskEither'
import { fst } from 'fp-ts/lib/Tuple'
import Path from 'path'
import * as C from '../../../icloud/drive/cache/cachef'
import { HierarchyResult, showGetByPathResult, target } from '../../../icloud/drive/cache/cachef/GetByPathResultValid'
import * as DF from '../../../icloud/drive/fdrive'
import { lsss } from '../../../icloud/drive/fdrive/lsss'
import {
  Details,
  DetailsRegular,
  DetailsRoot,
  DetailsTrash,
  DriveChildrenItem,
  DriveChildrenItemFile,
  fileName,
  isCloudDocsRootDetails,
  isDetails,
  isFileItem,
  isTrashDetails,
  isTrashDetailsG,
  RecursiveFolder,
} from '../../../icloud/drive/requests/types/types'
import { NEA } from '../../../lib/types'
import { cliAction } from '../../cli-action'
import { Env } from '../../types'
import { normalizePath } from './helpers'

type Output = string
type ErrorOutput = Error

const joinWithPath = (path: string) =>
  (name: string) =>
    pipe(
      Path.join('/', path, name),
      Path.normalize,
    )

const formatDate = (date: Date | string) =>
  pipe(
    typeof date === 'string' ? new Date(date) : date,
    date =>
      [
        date.toDateString().slice(4),
        date.toTimeString().substr(0, 5),
      ].join(' '),
  )

const showWithFullPath = (path: string) => flow(fileName, joinWithPath(path))

const showRaw = (result: Details | DriveChildrenItem) => JSON.stringify(result)

type Row = [string, string | number]
type Element = Row | string | false | Element[]
// type Component<P> = (props: P) => (Element | string | false)[]

const Trash = ({ details }: { details: DetailsTrash }): Element[] => {
  return [
    ['name', fileName(details)],
    ['numberOfItems', details.numberOfItems],
  ]
}

const Folder = ({ details }: { details: DetailsRoot | DetailsRegular }): Element[] => {
  return [
    ['name', fileName(details)],
    ['dateCreated', formatDate(details.dateCreated)],
    ['drivewsid', details.drivewsid],
    ['docwsid', details.docwsid],
    ['etag', details.etag],
    !!details.extension && ['extension', details.extension],
    !isCloudDocsRootDetails(details) && ['parentId', details.parentId],
  ]
}

const isRow = (input: Row | Element[]): input is Row => {
  return input.length == 2
    && typeof input[0] === 'string'
    && (typeof input[1] === 'string' || typeof input[1] === 'number')
}

const showElements = (elements: Element[]): string => {
  return pipe(
    elements,
    A.filter(not(<T>(v: T | false): v is false => !v)),
    A.map(_ => Array.isArray(_) ? isRow(_) ? _.join(':\t') : showElements(_) : _),
    _ => _.join('\n'),
  )
}

export const showFolderInfo = ({ showDrivewsid = false, showDocwsid = false } = {}) =>
  (details: Details) =>
    pipe(
      [
        isTrashDetailsG(details)
          ? Trash({ details })
          : Folder({ details }),
      ],
      showElements,
    )

export const showFileInfo = ({ showDrivewsid = false, showDocwsid = false } = {}) =>
  (result: DriveChildrenItemFile) =>
    [
      ['name', fileName(result)],
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
      ) + '\n',
      pipe(
        details.items,
        A.sortBy([ordByType, ordByName]),
        A.map(
          fullPath
            ? showWithFullPath(path)
            : showItemRow({ showDrivewsid, showDocwsid }),
        ),
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
    const folderName = fileName(folder.details)

    const fileNames = pipe(
      folder.details.items,
      A.filter(isFileItem),
      A.map(fileName),
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

const conditional = <A, B, R>(
  ref: <R>(input: A | B) => input is A,
  onTrue: (a: A) => R,
  onFalse: (b: B) => R,
) =>
  (input: A | B): R => {
    if (ref(input)) {
      return onTrue(input)
    }
    return onFalse(input)
  }

export const listUnixPath = (
  { sessionFile, cacheFile, paths, raw, noCache, fullPath, recursive, depth, listInfo, trash }: Env & {
    recursive: boolean
    paths: string[]
    fullPath: boolean
    listInfo: boolean
    update: boolean
    trash: boolean
    depth: number
  },
): TE.TaskEither<ErrorOutput, Output> => {
  if (recursive) {
    return cliAction(
      { sessionFile, cacheFile, noCache },
      ({ cache, api }) =>
        pipe(
          DF.getFolderRecursive(paths[0], depth)(cache)({ api }),
          noCache
            ? TE.chainFirst(() => TE.of(constVoid()))
            : TE.chainFirst(([item, cache]) => C.trySaveFile(cache, cacheFile)),
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
        DF.readEnv,
        DF.chain((): DF.DriveM<NEA<HierarchyResult<DetailsTrash | DetailsRoot>>> =>
          trash
            ? DF.chainTrash(trash => lsss(trash, npaths))
            : DF.chainRoot(root => lsss(root, npaths))
        ),
        DF.saveCacheFirst(cacheFile),
        SRTE.map(
          flow(
            A.zip(npaths),
            A.map(([result, path]) => {
              if (result.valid) {
                return pipe(
                  target(result),
                  conditional(
                    isDetails,
                    showDetailsInfo({ path, fullPath, printFolderInfo: true, ...opts }),
                    showFileInfo({ ...opts }),
                  ),
                )
              }
              return showGetByPathResult(result)
            }),
            _ => _.join('\n\n'),
          ),
        ),
        apply(cache),
        apply({ api }),
        TE.map(fst),
      )

      return res
    },
  )
}
