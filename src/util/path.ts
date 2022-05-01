import Path from 'path'
import { NormalizedPath, normalizePath, npath, stripTrailingSlash } from './normalize-path'
export { NormalizedPath, normalizePath, npath, Path, stripTrailingSlash }

export const prependPath = (parent: string) => (kid: string) => Path.join(parent, kid)
