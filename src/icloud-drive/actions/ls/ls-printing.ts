import { ord, string } from 'fp-ts'
import * as A from 'fp-ts/lib/Array'
import { constant, flow, identity, pipe } from 'fp-ts/lib/function'
import * as O from 'fp-ts/lib/Option'
import * as Ord from 'fp-ts/lib/Ord'
import { not } from 'fp-ts/lib/Refinement'
import * as TR from 'fp-ts/lib/Tree'
import Path from 'path'
import { Types } from '../../'

export const drawFileTree = (tree: TR.Tree<Types.HasName | Types.DetailsTrashRoot>): string => {
  return pipe(
    tree,
    TR.map(Types.fileNameAddSlash),
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

const showWithFullPath = (path: string) => flow(Types.fileName, joinWithPath(path))

type Row = [string, string | number]

type Element = Row | string | false | Element[]

const Trash = ({ details }: { details: Types.DetailsTrashRoot }): Element[] => {
  return [
    ['name', Types.fileName(details)],
    ['numberOfItems', details.numberOfItems],
  ]
}
const Folder = ({ details }: { details: Types.DetailsDocwsRoot | Types.NonRootDetails }): Element[] => {
  return [
    ['name', Types.fileName(details)],
    ['dateCreated', formatDate(details.dateCreated)],
    ['drivewsid', details.drivewsid],
    ['docwsid', details.docwsid],
    ['etag', details.etag],
    !!details.restorePath && ['restorePath', details.restorePath],
    !!details.extension && ['extension', details.extension],
    !Types.isCloudDocsRootDetails(details) && ['parentId', details.parentId],
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
  (details: Types.Details): string =>
    pipe(
      [
        Types.isTrashDetailsG(details)
          ? Trash({ details })
          : Folder({ details }),
      ],
      showElements,
    )

export const showFileInfo = (result: Types.DriveChildrenItemFile) =>
  ({ showDrivewsid = false, showDocwsid = false } = {}): string =>
    pipe(
      [
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
      ],
      showElements,
    )
const showItemRow = ({
  short = false,
  showDrivewsid = false,
  showDocwsid = false,
  showEtag = false,
} = {}) =>
  (item: Types.DriveChildrenItem) => {
    const row: string[] = []

    if (item.type === 'FILE') {
      if (!short) {
        if (showEtag) {
          row.push(item.etag)
        }

        row.push(formatDate(item.dateModified))

        showDrivewsid && row.push(item.drivewsid)
        showDocwsid && row.push(item.docwsid)

        row.push(item.size.toString())
      }
      row.push(Types.fileName(item))
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
      row.push(Types.fileName(item) + '/')
    }

    return row.join('\t')
  }
const ordByType = Ord.contramap((d: Types.DriveChildrenItem) => d.type)(ord.reverse(string.Ord))
const ordByName = Ord.contramap((d: Types.DriveChildrenItem) => d.name)(string.Ord)

export const showDetailsInfo = (
  details: Types.Details,
  path: string,
) =>
  (
    {
      fullPath,
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
    },
  ): string =>
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

const nSymbols = (n: number, s: string) => {
  return Array(n).fill(s).join('')
}

export type RecursiveFolder =
  | {
    readonly details: Types.Details
    readonly deep: true
    readonly children: RecursiveFolder[]
  }
  | {
    readonly details: Types.Details
    readonly deep: false
  }

const prependStrings = (s: string) => (a: string[]) => a.map(_ => s + _)

const showRecursive = ({ ident = 0 }) =>
  (folder: RecursiveFolder): string => {
    const folderName = Types.fileName(folder.details)

    const fileNames = pipe(
      folder.details.items,
      A.filter(Types.isFileItem),
      A.map(Types.fileName),
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
