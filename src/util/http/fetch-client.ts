import axios, { AxiosError, AxiosRequestConfig, AxiosResponse, Method } from 'axios'
import FormData from 'form-data'
import { random } from 'fp-ts'
import { flow, pipe } from 'fp-ts/lib/function'
import { Predicate } from 'fp-ts/lib/Predicate'
import * as TE from 'fp-ts/lib/TaskEither'
import { httpfilelogger } from '../../logging/logging'

export interface HttpRequest extends AxiosRequestConfig {
  data: unknown
  headers: HttpHeaders
}

export interface HttpResponse extends AxiosResponse {
  data: unknown
  headers: HttpHeaders
}

export type HttpHeaders = Record<string, string | string[]>

const _client = (config: HttpRequest) =>
  axios.request({
    ...config,
    validateStatus: () => true,
    // (code) => code < 500,
  })

export type FetchClient = typeof _client
export type FetchClientEither = (
  config: HttpRequest,
) => TE.TaskEither<FetchError, HttpResponse>

export class HttpRequest implements HttpRequest {
  constructor(
    public readonly url: string,
    props: {
      method: Method
      headers: HttpHeaders
      body?: unknown
    },
  ) {
    this.method = props.method
    this.headers = props.headers
    this.data = props.body
  }
}

export const fetchClient: FetchClientEither = (config) =>
  TE.tryCatch(
    async () => {
      httpfilelogger.debug({
        url: config.url,
        // headers: config.headers,
        request: config.data,
      })

      const res = await _client(config)

      httpfilelogger.debug({
        status: res.status,
        // headers: res.headers,
        response: res.data,
      })

      return res
    },
    (error) => {
      httpfilelogger.debug('error')
      if (axios.isAxiosError(error)) {
        httpfilelogger.debug(error.response)
        return FetchError.create(`Error fetching: ${String(error)}`, error)
      }
      return FetchError.create(`Error fetching: ${String(error)}`)
    },
  )

export const expectResponse = (
  predicate: Predicate<HttpResponse>,
  error: (response: HttpResponse) => Error,
): ((
  te: TE.TaskEither<Error, HttpResponse>,
) => TE.TaskEither<Error, HttpResponse>) => TE.chainW(TE.fromPredicate(predicate, error))

export const uploadFileRequest = (
  url: string,
  filename: string,
  fileBuffer: Buffer,
): HttpRequest => {
  const formData = new FormData()
  // formData.append('name', 'files')
  formData.append('files', fileBuffer, { filename })

  return {
    url,
    method: 'POST',
    headers: formData.getHeaders(),
    data: formData.getBuffer(),
  }
}

export class FetchError extends Error {
  constructor(message: string, public readonly axiosError?: AxiosError) {
    super(message)
  }

  public static is(a: Error): a is FetchError {
    return a instanceof FetchError
  }

  public static create(message: string, axiosError?: AxiosError): FetchError {
    return new FetchError(message, axiosError)
  }
}

import * as E from 'fp-ts/Either'
import * as IO from 'fp-ts/IO'

export const failingFetch = (t = 90) =>
  flow(
    fetchClient,
    TE.chainIOEitherK(resp => {
      return pipe(
        random.randomInt(0, 100),
        IO.map(n =>
          n > t
            ? E.of(resp)
            : E.left(FetchError.create('failingFetch failed'))
        ),
      )
    }),
  )
