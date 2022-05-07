import { hasOwnProperty } from '../../../../../util/util'

export const isEnoentError = (e: Error): boolean => hasOwnProperty(e, 'code') && e.code === 'ENOENT'

export const isEexistError = (e: Error): boolean => hasOwnProperty(e, 'code') && e.code === 'EEXIST'
