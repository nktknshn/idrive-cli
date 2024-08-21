import { logTimeRTE, logTimeTE } from '../util/log-time'
import { timeLoggerIO } from '../util/logging'

export const debugTimeTE = logTimeTE(timeLoggerIO.debug)
export const debugTimeRTE = logTimeRTE(timeLoggerIO.debug)
