import { hasOwnProperty } from '../util'

export type ErrorWithCode = Error & {
  code: string
}

export const isEnoentError = (e: Error): boolean => hasOwnProperty(e, 'code') && e.code === 'ENOENT'

export const isEexistError = (e: Error): boolean => hasOwnProperty(e, 'code') && e.code === 'EEXIST'

export const isEisdirError = (e: Error): boolean => hasOwnProperty(e, 'code') && e.code === 'EISDIR'

export const isErrorWithCode = (e: unknown): e is ErrorWithCode =>
  e instanceof Error && hasOwnProperty(e, 'code') && typeof e.code === 'string'
