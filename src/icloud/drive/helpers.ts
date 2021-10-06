import Path from 'path'

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