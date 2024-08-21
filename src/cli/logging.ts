import { logTimeIO, logTimeRTE, logTimeSRTE, logTimeTE } from '../util/log-time'
import { timeLoggerIO } from '../util/logging'

// export const debugTimeIO = logTimeIO(timeLoggerIO.debug)

// TODO use different logger
export const debugTimeIO = logTimeIO(timeLoggerIO.debug)
export const debugTimeTE = logTimeTE(timeLoggerIO.debug)
export const debugTimeRTE = logTimeRTE(timeLoggerIO.debug)
export const debugTimeSRTE = logTimeSRTE(timeLoggerIO.debug)
