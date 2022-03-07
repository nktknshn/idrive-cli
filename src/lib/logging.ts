import chalk from 'chalk'
import { pipe } from 'fp-ts/function'
import * as TE from 'fp-ts/lib/TaskEither'
import * as winston from 'winston'
import { isObjectWithOwnProperty } from './util'
const { combine, timestamp, label, prettyPrint, json } = winston.format

// const jsonError = winston.format((info, opts) => {

// })

export const printerIO = {
  print: <T>(value: T) =>
    () => {
      console.log(value)
    },
  error: () =>
    (value: Error | string) =>
      () => {
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

export const logff = <T>(f: (v: T) => string, lgr = logger.debug) => (v: T) => logReturn<T>(() => lgr(f(v)))

export const logg = (msg: string, f = logger.debug) => f(msg)

const plain = (type: string, f: (s: string) => string = a => a) =>
  winston.format.printf(({ level, message, label, timestamp }) => {
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
    plain('cache', chalk.grey),
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

export const logReturnS = <T>(
  logFunc: (value: T) => string,
  _logger = logger.debug,
) =>
  (value: T): T => {
    _logger(logFunc(value))
    return value
  }

export const logReturnAs = <T>(key: string, f: (v: T) => unknown = v => JSON.stringify(v), _logger = logger.debug) =>
  (value: T): T => {
    _logger(`${key} = ${f(value)}`)

    return value
  }

export const teLogS = <T>(
  logFunc: (value: T) => string,
  _logger = logger.debug,
) =>
  (te: TE.TaskEither<Error, T>): TE.TaskEither<Error, T> => {
    return pipe(
      te,
      TE.map((v) => {
        _logger(logFunc(v))
        return v
      }),
    )
  }

export const initLoggers = (
  argv: { debug: boolean },
  loggers: winston.Logger[],
) => {
  for (const logger of loggers) {
    logger.add(argv.debug ? loggingLevels.debug : loggingLevels.info)
  }
}

export { httplogger, logger, printer }
