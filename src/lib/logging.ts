import { Format, TransformableInfo, TransformFunction } from 'logform';
import * as winston from 'winston'
import { hasOwnProperty } from './util';
const { combine, timestamp, label, prettyPrint, json } = winston.format;

// const jsonError = winston.format((info, opts) => {

// })

const logger = winston.createLogger({
    level: 'debug',
    format: combine(
        json({
            space: 2,
            replacer: (key, value) => {
                if(key == 'password') {
                    return '<hidden>'
                }
                if(key == 'session') {
                    return '<hidden>'
                }

                if(value instanceof Error) {
                    return {
                        // ...value,
                        tag: hasOwnProperty(value, 'tag') ? value.tag : undefined,
                        message: value.message
                    }
                }
                return value
            }
        }),
        prettyPrint({
            colorize: true
        })
    ),
    transports: [
        new winston.transports.Console({
            stderrLevels: ['debug']
        }),
    ]
})

const httplogger = winston.createLogger({
    level: 'debug',
    transports: [
        new winston.transports.File({
            filename: 'data/http-log.json',

            // tailable: true
            // format: ''
            format: combine(
                // prettyPrint()
            )
        }),
    ]
})

export { logger, httplogger }