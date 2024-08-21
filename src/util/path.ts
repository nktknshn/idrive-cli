import Path from 'path'
import { NormalizedPath, normalizePath, npath, stripTrailingSlash } from './normalize-path'
export { type NormalizedPath, normalizePath, npath, Path, stripTrailingSlash }

export const prependPath = (parent: string) => (kid: string) => Path.join(parent, kid)
