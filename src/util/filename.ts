import { pipe } from 'fp-ts/lib/function'
import { Path } from './path'

export const parseFilename = (fileName: string): { name: string; extension?: string } => {
  const extension = pipe(
    Path.extname(fileName),
    _ => _ === '' ? undefined : _,
  )

  return {
    name: extension ? fileName.slice(0, fileName.length - extension.length) : fileName,
    extension: extension ? extension.slice(1) : undefined,
  }
}

export const appendFilename = (fileName: string, suffix: string): string => {
  const { name, extension } = parseFilename(fileName)
  return `${name}${suffix}${extension ? `.${extension}` : ''}`
}
