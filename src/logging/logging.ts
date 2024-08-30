import chalk from 'chalk'
import * as winston from 'winston'
import { isObjectWithOwnProperty } from '../util/util'
import { fromWinston } from './loggerIO'
const { combine, prettyPrint, json } = winston.format

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

const plain = (type: string, f: (s: string) => string = a => a) =>
  winston.format.printf(({ level, message }) => {
    // can also add label, timestamp
    return f(`> ${level}: ${type}: ${message}`)
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

export const timeLogger = winston.createLogger({
  level: 'debug',
  format: combine(
    plain('time', chalk.blue),
  ),
  transports: [loggingLevels.infoToStderr],
})

export const timeLoggerIO = fromWinston(timeLogger)

export const authLogger = winston.createLogger({
  level: 'debug',
  format: combine(
    plain('auth', chalk.green),
  ),
  transports: [loggingLevels.infoToStderr],
})

export const apiLogger = winston.createLogger({
  level: 'debug',
  format: combine(
    // prettyPrint({
    //   colorize: true,
    //   depth: 3,
    // }),
    // winston.format.colorize({ colors: { 'debug': 'blue' } }),
    plain('api', chalk.blue),
  ),
  transports: [loggingLevels.infoToStderr],
})

export const stderrLogger = winston.createLogger({
  level: 'debug',
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
    plain('cache', chalk.greenBright),
  ),
})

const httpfilelogger = winston.createLogger({
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

export const initLoggers = (
  argv: { debug: boolean },
  loggers: winston.Logger[],
): void => {
  for (const logger of loggers) {
    logger.add(
      argv.debug
        ? loggingLevels.debug
        : loggingLevels.info,
    )
  }
}

export { httpfilelogger, logger }
