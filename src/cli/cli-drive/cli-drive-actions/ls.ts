import assert from 'assert'
import { ord, string } from 'fp-ts'
import * as A from 'fp-ts/lib/Array'
import { apply, constant, constVoid, flow, identity, pipe } from 'fp-ts/lib/function'
import * as NA from 'fp-ts/lib/NonEmptyArray'
import * as O from 'fp-ts/lib/Option'
import * as Ord from 'fp-ts/lib/Ord'
import { mapFst, mapSnd } from 'fp-ts/lib/ReadonlyTuple'
import { not } from 'fp-ts/lib/Refinement'
import * as SRTE from 'fp-ts/lib/StateReaderTaskEither'
import * as TE from 'fp-ts/lib/TaskEither'
import { fst, swap } from 'fp-ts/lib/Tuple'
import Path from 'path'
import { defaultApiEnv } from '../../../defaults'
import * as C from '../../../icloud/drive/cache/cache'
import {
  HierarchyResult,
  isInvalid,
  isValid,
  showGetByPathResult,
  target,
} from '../../../icloud/drive/cache/cache-get-by-path-types'
import * as DF from '../../../icloud/drive/ffdrive'
import { cliActionM2 } from '../../../icloud/drive/ffdrive/cli-action'
import { recordFromTuples } from '../../../icloud/drive/helpers'
import * as T from '../../../icloud/drive/requests/types/types'
import { fetchClient } from '../../../lib/http/fetch-client'
import { input } from '../../../lib/input'
import { NEA } from '../../../lib/types'
// import { cliActionM } from '../../cli-action'
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
      date.getFullYear() == new Date().getFullYear()
        ? [
          date.toDateString().slice(4, 7),
          date.toDateString().slice(8, 10),
          date.toTimeString().substr(0, 5),
        ].join(' ')
        : [
          date.toDateString().slice(4, 7),
          date.toDateString().slice(8, 10),
          date.getFullYear(),
        ].join(' '),
  )

const showWithFullPath = (path: string) => flow(T.fileName, joinWithPath(path))

const showRaw = (result: T.Details | T.DriveChildrenItem) => JSON.stringify(result)

type Row = [string, string | number]
type Element = Row | string | false | Element[]
// type Component<P> = (props: P) => (Element | string | false)[]

const Trash = ({ details }: { details: T.DetailsTrash }): Element[] => {
  return [
    ['name', T.fileName(details)],
    ['numberOfItems', details.numberOfItems],
  ]
}

const Folder = ({ details }: { details: T.DetailsDocwsRoot | T.NonRootDetails }): Element[] => {
  return [
    ['name', T.fileName(details)],
    ['dateCreated', formatDate(details.dateCreated)],
    ['drivewsid', details.drivewsid],
    ['docwsid', details.docwsid],
    ['etag', details.etag],
    !!details.restorePath && ['restorePath', details.restorePath],
    !!details.extension && ['extension', details.extension],
    !T.isCloudDocsRootDetails(details) && ['parentId', details.parentId],
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
  (details: T.Details) =>
    pipe(
      [
        T.isTrashDetailsG(details)
          ? Trash({ details })
          : Folder({ details }),
      ],
      showElements,
    )

export const showFileInfo = ({ showDrivewsid = false, showDocwsid = false } = {}) =>
  (result: T.DriveChildrenItemFile) =>
    pipe(
      [
        // ['name', T.fileName(result)],
        // ['type', result.type],
        ['size', result.size],
        ['dateCreated', formatDate(result.dateCreated)],
        ['dateChanged', formatDate(result.dateChanged)],
        ['dateModified', formatDate(result.dateModified)],
        ['drivewsid', result.drivewsid],
        ['docwsid', result.docwsid],
        ['etag', result.etag],
        ['zone', result.zone],
        ['parentId', result.parentId],
        !!result.restorePath && ['restorePath', result.restorePath],
        showDrivewsid && ['drivewsid', result.drivewsid],
        showDocwsid && ['docwsid', result.docwsid],
        // ...[showDrivewsid ? [['drivewsid', result.drivewsid]] : []],
        // ...[showDocwsid ? [['docwsid', result.docwsid]] : []],
      ],
      showElements,
    )
// .map(_ => _.join(':\t'))
// .join('\n')

const showItemRow = ({
  short = false,
  showDrivewsid = false,
  showDocwsid = false,
  showEtag = false,
} = {}) =>
  (item: T.DriveChildrenItem) => {
    let row = []

    if (item.type === 'FILE') {
      if (!short) {
        if (showEtag) {
          row.push(item.etag)
        }

        row.push(formatDate(item.dateModified))

        showDrivewsid && row.push(item.drivewsid)
        showDocwsid && row.push(item.docwsid)

        row.push(item.size)
      }
      row.push(T.fileName(item))
    }
    else {
      if (!short) {
        if (showEtag) {
          row.push(item.etag)
        }

        row.push(formatDate(item.dateCreated))

        showDrivewsid && row.push(item.drivewsid)
        showDocwsid && row.push(item.docwsid)

        row.push(item.type)
      }
      row.push(T.fileName(item) + '/')
    }

    return row.join('\t')
  }

const ordByType = Ord.contramap((d: T.DriveChildrenItem) => d.type)(ord.reverse(string.Ord))
const ordByName = Ord.contramap((d: T.DriveChildrenItem) => d.name)(string.Ord)

export const showDetailsInfo = (
  {
    fullPath,
    path,
    showDrivewsid = false,
    showDocwsid = false,
    printFolderInfo = false,
    showEtag = false,
    showHeader = false,
  }: {
    showDrivewsid?: boolean
    showDocwsid?: boolean
    showEtag?: boolean
    showHeader?: boolean
    printFolderInfo?: boolean
    fullPath: boolean
    path: string
  },
) =>
  (details: T.Details) =>
    string.Monoid.concat(
      showHeader
        ? pipe(
          details,
          O.fromPredicate(() => printFolderInfo),
          O.map(showFolderInfo({ showDrivewsid, showDocwsid })),
          O.fold(constant(string.empty), identity),
        ) + '\n' + (details.items.length > 0 ? '\n' : '')
        : '',
      pipe(
        details.items,
        A.sortBy([ordByType, ordByName]),
        A.map(
          fullPath
            ? showWithFullPath(path)
            : showItemRow({ showDrivewsid, showDocwsid, showEtag }),
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

const prependStrings = (s: string) => (a: string[]) => a.map(_ => s + _)

const showRecursive = ({ ident = 0 }) =>
  (folder: T.RecursiveFolder): string => {
    const folderName = T.fileName(folder.details)

    const fileNames = pipe(
      folder.details.items,
      A.filter(T.isFileItem),
      A.map(T.fileName),
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
  { sessionFile, cacheFile, paths, raw, noCache, fullPath, recursive, depth, listInfo, trash, etag, cached, header }:
    & Env
    & {
      recursive: boolean
      paths: string[]
      fullPath: boolean
      listInfo: boolean
      update: boolean
      trash: boolean
      depth: number
      raw: boolean
      cached: boolean
      etag: boolean
      header: boolean
    },
): TE.TaskEither<ErrorOutput, Output> => {
  // if (recursive) {
  //   return pipe(
  //     { sessionFile, cacheFile, noCache },
  //     cliActionM(
  //       ({ cache, api }) =>
  //         pipe(
  //           DF.getFolderRecursive(paths[0], depth)({ cache })({ api }),
  //           noCache
  //             ? TE.chainFirst(() => TE.of(constVoid()))
  //             : TE.chainFirst(([item, { cache }]) => C.trySaveFile(cache, cacheFile)),
  //           TE.map(([v, cache]) => raw ? JSON.stringify(v) : showRecursive({})(v)),
  //         ),
  //     ),
  //   )
  // }

  const opts = { showDocwsid: false, showDrivewsid: listInfo, showEtag: etag, showHeader: header }
  const npaths = paths.map(normalizePath)

  assert(A.isNonEmpty(npaths))

  return pipe(
    { sessionFile, cacheFile, noCache, ...defaultApiEnv },
    cliActionM2(() => {
      const res = pipe(
        DF.getCachedRoot(trash),
        DF.chain(root =>
          cached
            ? DF.getByPathsCached(root, npaths)
            : DF.getByPaths(root, npaths)
        ),
        SRTE.map(
          raw
            ? flow(
              NA.zip(npaths),
              NA.map(swap),
              recordFromTuples,
              JSON.stringify,
            )
            : flow(
              NA.zip(npaths),
              NA.map(([result, path]) => {
                if (result.valid) {
                  return pipe(
                    target(result),
                    conditional(
                      T.isDetails,
                      showDetailsInfo({ path, fullPath, printFolderInfo: true, ...opts }),
                      showFileInfo({ ...opts }),
                    ),
                  )
                }

                return showGetByPathResult(result)
              }),
              npaths.length > 1
                ? flow(
                  NA.zip(npaths),
                  NA.map(([output, path]) => path + ':\n' + output),
                  _ => _.join('\n\n'),
                )
                : v => NA.head(v),
              // _ => _.join
            ),
        ),
      )

      return res
    }),
  )
}
