import * as O from 'fp-ts/lib/Option'
import Path from 'path'
import { isObjectWithOwnProperty } from '../../lib/util'
import {
  DriveChildrenItem,
  DriveDetails,
  DriveDetailsRoot,
  isFolderDetails,
  isFolderLike,
  isRootDetails,
} from './types'

export function parsePath(path: string): string[] {
  const parsedPath = Path.normalize(path)
    .replace(/^\//, '')
    .replace(/\/$/, '')
    .split('/')

  return parsedPath.length == 1 && parsedPath[0] == ''
    ? ['/']
    : ['/', ...parsedPath]
}

export const normalizePath = (path: string) => {
  const [root, ...rest] = parsePath(path)

  return `${root}${rest.join('/')}`
}

export const splitParent = (path: string) => {
  const parent = Path.parse(path).dir
  const name = Path.parse(path).name

  return name === '' ? O.none : O.some([parent, name] as const)
}

export const fileName = (item: DriveChildrenItem | DriveDetails) =>
  (isFolderDetails(item) && isRootDetails(item))
    ? '/'
    : isObjectWithOwnProperty(item, 'extension')
    ? `${item.name}${item.extension ? `.${item.extension}` : ''}`
    : `${item.name}`
// item.type === 'FILE'
//   ? `${item.name}${item.extension ? `.${item.extension}` : ''}`
//   : `${item.name}`
