import * as IO from 'fp-ts/lib/IO'
import * as SRTE from 'fp-ts/lib/StateReaderTaskEither'
import { logger } from './logging'

export const loggerIO = {
  debug: (msg: string) =>
    () => {
      logger.debug(msg)
    },
  error: (msg: string) =>
    () => {
      logger.error(msg)
    },
}

// export const loggerSRTE = SRTE.chainFirstIOK(loggerIO.debug)
