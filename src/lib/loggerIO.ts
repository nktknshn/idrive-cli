import * as IO from 'fp-ts/lib/IO'
import { logger } from './logging'

export const loggerIO = {
  debug: (msg: string) => () => logger.debug(msg),
}
