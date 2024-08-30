import { logTimeIO, logTimeRTE, logTimeSRTE, logTimeTE } from './log-time'
import { timeLoggerIO } from './logging'

// export const debugTimeIO = logTimeIO(timeLoggerIO.debug)

export const debugTimeIO = logTimeIO(timeLoggerIO.debug)
export const debugTimeTE = logTimeTE(timeLoggerIO.debug)
export const debugTimeRTE = logTimeRTE(timeLoggerIO.debug)
export const debugTimeSRTE = logTimeSRTE(timeLoggerIO.debug)
