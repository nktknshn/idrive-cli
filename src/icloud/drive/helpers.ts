import Path from 'path'
import * as O from 'fp-ts/lib/Option'

export function parsePath(
    path: string
): string[] {
    const parsedPath = Path.normalize(path)
        .replace(/^\//, '')
        .replace(/\/$/, '')
        .split('/')

    return parsedPath.length == 1 && parsedPath[0] == '' ? ['/'] : ['/', ...parsedPath]
}

export const normalizePath = (path: string) => {
    const [root, ...rest] = parsePath(path)

    return `${root}${rest.join('/')}`
}

export const splitParent = (path: string) => {
    const parent = Path.parse(path).dir
    const name = Path.parse(path).name

    return name === "" ? O.none : O.some([parent, name] as const)
}