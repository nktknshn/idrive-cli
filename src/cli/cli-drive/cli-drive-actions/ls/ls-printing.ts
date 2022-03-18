import { ord, string } from 'fp-ts'
import * as A from 'fp-ts/lib/Array'
import { constant, flow, identity, pipe } from 'fp-ts/lib/function'
import * as O from 'fp-ts/lib/Option'
import * as Ord from 'fp-ts/lib/Ord'
import { not } from 'fp-ts/lib/Refinement'
import * as TR from 'fp-ts/lib/Tree'
import Path from 'path'
import * as T from '../../../../icloud/drive/requests/types/types'

export const drawFileTree = (tree: TR.Tree<T.HasName | T.DetailsTrash>) => {
  return pipe(
    tree,
    TR.map(T.fileNameAddSlash),
    TR.drawTree,
  )
}

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
