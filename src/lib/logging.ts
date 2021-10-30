import { Format, TransformableInfo, TransformFunction } from 'logform'
import * as winston from 'winston'
import { hasOwnProperty, isObjectWithOwnProperty } from './util'
const { combine, timestamp, label, prettyPrint, json } = winston.format
import { identity } from 'fp-ts/function'
import { IO } from 'fp-ts/lib/IO'
import { InvalidJsonInResponse } from './errors'
// const jsonError = winston.format((info, opts) => {

// })

const printer = {
  print: <T>(value: T): void => {
    console.log(value)
  },
  error: (value: Error | string): void => {
    console.error(value)
  },
  printTask: <T>(value: T): () => Promise<void> =>
    async () => {
      console.log(value)
    },
  errorTask: (value: Error): () => Promise<void> =>
    async () => {
      console.error({
        // name: value.name,
        error: value.message,
        name: value.name,
        stack: value.stack,
        input: InvalidJsonInResponse.is(value) ? value.input : undefined,
        // httpResponse: InvalidJsonInResponse.is(value) ? value.httpResponse : undefined,
      })
    },
}

export const loggingLevels = {
  info: new winston.transports.Console({
    stderrLevels: ['debug'],
    level: 'info',
  }),
  debug: new winston.transports.Console({
    stderrLevels: ['debug'],
    level: 'debug',
  }),
  infoToStderr: new winston.transports.Console({
    stderrLevels: ['info'],
    level: 'info',
  }),
}

// export const setLoggingLevel()

const logger = winston.createLogger({
  level: 'debug',
  format: combine(
    json({
      space: 2,
      replacer: (key, value) => {
        if (key == 'password') {
          return '<hidden>'
        }
        if (key == 'session') {
          return '<hidden>'
        }
        if (key == 'httpResponse') {
          return '<hidden>'
        }

        if (value instanceof Error) {
          return {
            // ...value,
            tag: isObjectWithOwnProperty(value, 'tag') ? value.tag : undefined,
            message: value.message,
          }
        }
        return value
      },
    }),
    prettyPrint({
      colorize: true,
      depth: 4,
    }),
  ),
})

export const stderrLogger = winston.createLogger({
  level: 'info',
  format: combine(
    prettyPrint({
      colorize: true,
      depth: 3,
    }),
  ),
  transports: [loggingLevels.infoToStderr],
})

export const cacheLogger = winston.createLogger({
  level: 'debug',
  format: combine(
    prettyPrint({
      colorize: true,
      depth: 4,
    }),
  ),
})

const httplogger = winston.createLogger({
  level: 'debug',
  transports: [
    new winston.transports.File({
      filename: 'data/http-log.json',

      // tailable: true
      // format: ''
      format: combine(),
      // prettyPrint()
    }),
  ],
})

export const logReturn = <T>(logFunc: (value: T) => void) =>
  (value: T): T => {
    logFunc(value)
    return value
  }

export const logReturnAs = <T>(key: string, f = identity, _logger = logger.debug) =>
  (value: T): T => {
    _logger({ [key]: f(value) })
    return value
  }

export { httplogger, logger, printer }
