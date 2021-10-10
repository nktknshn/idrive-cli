import { Option } from 'fp-ts/lib/Option'
import * as TE from 'fp-ts/lib/TaskEither'
import * as T from 'fp-ts/lib/Task'
import * as E from 'fp-ts/lib/Either'
import * as O from 'fp-ts/lib/Option'
import { pipe } from "fp-ts/lib/function"
import { httplogger, logger } from "./logging"
import { AxiosRequestConfig, AxiosResponse, Method, ResponseType } from 'axios'
import axios from 'axios'
import { Predicate } from 'fp-ts/lib/Predicate'


export interface HttpRequest extends AxiosRequestConfig {
    data: unknown
    headers: HttpHeaders
}

export interface HttpResponse extends AxiosResponse {
    data: unknown
    headers: HttpHeaders
}

export type HttpHeaders = Record<string, string | string[]>

const _client = (config: HttpRequest) => axios.request({
    ...config,
    validateStatus: code => code < 500
})

export type FetchClient = typeof _client
export type FetchClientEither = (config: HttpRequest) => TE.TaskEither<FetchError, HttpResponse>


export class HttpRequest implements HttpRequest {
    constructor(
        public readonly url: string,
        props: {
            method: Method,
            headers: HttpHeaders,
            body?: unknown
        }
    ) {
        this.method = props.method
        this.headers = props.headers
        this.data = props.body
    }
}

export class FetchError extends Error {

    readonly tag = 'FetchError'

    public static is(a: unknown): a is FetchError {
        return a instanceof FetchError
    }

    public static create(message: string) {
        return new FetchError(message)
    }
}

export const fetchClient: FetchClientEither = (config) => TE.tryCatch(
    async () => {
        httplogger.debug(config.url)
        httplogger.debug(config.data)
        
        const res = await _client(config)

        httplogger.debug(res.status)
        httplogger.debug(res.data)
        
        return res
        // if (input instanceof Request) {
        //     const { clone, show } = await showRequest(input)
        //     input = clone
        //     // logger.debug(input.url)
        //     // logger.debug(headersToArray(input.headers).join(', '))
        //     httplogger.debug(show)
        // }

        // const res = await fetch(input, init)

        // httplogger.debug(res.status)
        // httplogger.debug(await res.json())

        // return res
    },
    error => {
        httplogger.debug('error')
        // httplogger.debug(config)
        return new FetchError(`Error fetching: ${String(error)}`)
    })


export const expectResponse = (
    predicate: Predicate<HttpResponse>,
    error: (response: HttpResponse) => Error
): (te: TE.TaskEither<Error, HttpResponse>) =>
        TE.TaskEither<Error, HttpResponse> => TE.chainW(TE.fromPredicate(predicate, error))

// const mockedFetch = (responses: TE.TaskEither<FetchError, HttpResponse>[]): FetchClientEither => {
//     responses = [...responses]

//     return (config) => {
//         return pipe(
//             responses.shift(),
//             E.fromNullable(FetchError.create('out of responses')),
//             TE.fromEither,
//             TE.flatten
//         )
//     }
// }
