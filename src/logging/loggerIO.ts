import { pipe } from 'fp-ts/lib/function'
import * as IO from 'fp-ts/lib/IO'
import * as SRTE from 'fp-ts/lib/StateReaderTaskEither'
import * as winston from 'winston'
import { logger } from './logging'

export type LoggerIO = {
  debug: (msg: string) => () => void
  error: (msg: string) => () => void
}

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

export const fromWinston = (w: winston.Logger): LoggerIO => {
  return {
    debug: (msg: string) => () => w.debug(msg),
    error: (msg: string) => () => w.error(msg),
  }
}
