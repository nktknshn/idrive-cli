import * as winston from 'winston'
import { apiLogger, logger, timeLogger } from './logging'

export type LoggerIO = {
  debug: (msg: string) => () => void
  error: (msg: string) => () => void
  info: (msg: string) => () => void
  warn: (msg: string) => () => void
}

export const fromWinston = (w: winston.Logger): LoggerIO => {
  return {
    debug: (msg: string) => () => w.debug(msg),
    error: (msg: string) => () => w.error(msg),
    info: (msg: string) => () => w.info(msg),
    warn: (msg: string) => () => w.warn(msg),
  }
}

export const loggerIO = fromWinston(logger)
export const apiLoggerIO = fromWinston(apiLogger)
export const timeLoggerIO = fromWinston(timeLogger)
