import * as winston from 'winston'
import { logger } from './logging'

export type LoggerIO = {
  debug: (msg: string) => () => void
  error: (msg: string) => () => void
  info: (msg: string) => () => void
  warn: (msg: string) => () => void
}

export const loggerIO = {
  debug: (msg: string) =>
    (): void => {
      logger.debug(msg)
    },
  error: (msg: string) =>
    (): void => {
      logger.error(msg)
    },
  info: (msg: string) =>
    (): void => {
      logger.info(msg)
    },
  warn: (msg: string) =>
    (): void => {
      logger.warn(msg)
    },
}

export const fromWinston = (w: winston.Logger): LoggerIO => {
  return {
    debug: (msg: string) => () => w.debug(msg),
    error: (msg: string) => () => w.error(msg),
    info: (msg: string) => () => w.info(msg),
    warn: (msg: string) => () => w.warn(msg),
  }
}
