import { flow } from 'fp-ts/lib/function'
import { debugTimeSRTE } from '../../logging/debug-time'
import { apiLoggerIO } from '../../logging/loggerIO'
import { runLogging } from '../../util/srte-utils'

export const logAPI = (apiname: string) =>
  flow(
    runLogging(apiLoggerIO.debug(apiname)),
    debugTimeSRTE(apiname),
  )
