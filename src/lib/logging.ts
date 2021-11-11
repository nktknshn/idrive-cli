import { Format, TransformableInfo, TransformFunction } from 'logform'
import * as winston from 'winston'
import { hasOwnProperty, isObjectWithOwnProperty } from './util'
const { combine, timestamp, label, prettyPrint, json } = winston.format
import { identity } from 'fp-ts/function'
import { IO } from 'fp-ts/lib/IO'
import fs from 'fs'
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
      console.error(value.message)
      // console.error({
      //   // name: value.name,
      //   error: value.message,
      //   name: value.name,
      //   stack: value.stack,
      //   input: InvalidJsonInResponse.is(value) ? value.input : undefined,
      //   // httpResponse: InvalidJsonInResponse.is(value) ? value.httpResponse : undefined,
      // })
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
export const logf = <T>(msg: string, lgr = logger.debug) => logReturn<T>(() => lgr(msg))

const plain = (type: string) =>
  winston.format.printf(({ level, message, label, timestamp }) => {
    return `${level}: ${type}: ${message}`
  })

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
      depth: 6,
    }),
    plain('logger'),
  ),
})

export const stderrLogger = winston.createLogger({
  level: 'info',
  format: combine(
    prettyPrint({
      colorize: true,
      depth: 3,
    }),
    plain('stderrLogger'),
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
    plain('cache'),
  ),
})

const httplogger = winston.createLogger({
  level: 'debug',
  transports: [
    new winston.transports.File({
      filename: 'data/http-log.json',
      options: { flags: 'w' },
      // tailable: true
      // format: ''
      format: combine(prettyPrint({
        colorize: false,
        depth: 128,
      })),
      // prettyPrint()
    }),
  ],
})

export const logReturn = <T>(logFunc: (value: T) => void) =>
  (value: T): T => {
    logFunc(value)
    return value
  }

export const logReturnAs = <T>(key: string, f: (v: T) => unknown = v => JSON.stringify(v), _logger = logger.debug) =>
  (value: T): T => {
    _logger(`${key} = ${f(value)}`)

    return value
  }

export { httplogger, logger, printer }
