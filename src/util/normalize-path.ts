import { pipe } from 'fp-ts/lib/function'
import { Path } from './path'

declare const _brand: unique symbol

export interface Brand<B> {
  readonly [_brand]: B
}

export interface NormalizedPathBrand {
  readonly NormalizedPath: unique symbol
}

export interface NonRootDrivewsidBrand {
  readonly NonRootDrivewsid: unique symbol
}

export type Branded<A, B> = A & Brand<B>
/**
 * NormalizedPath has Path.normalize applied and no trailing slash
 */

export type NormalizedPath = Branded<string, NormalizedPathBrand>

export const stripTrailingSlash = (s: string) => s == '/' ? s : s.replace(/\/$/, '')
const addLeadingSlash = (s: string) => s.startsWith('/') ? s : `/${s}`

/**
 * NormalizedPath has Path.normalize applied and no trailing slash
 */

export const normalizePath = (path: string): NormalizedPath => {
  return pipe(
    Path.normalize(path),
    stripTrailingSlash,
    addLeadingSlash,
  ) as NormalizedPath
}

export const npath = normalizePath
