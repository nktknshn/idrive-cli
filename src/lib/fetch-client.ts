import { AxiosRequestConfig, AxiosResponse, Method, ResponseType } from 'axios'
import axios from 'axios'
import FormData from 'form-data'
import * as E from 'fp-ts/lib/Either'
import { pipe } from 'fp-ts/lib/function'
import { Option } from 'fp-ts/lib/Option'
import * as O from 'fp-ts/lib/Option'
import { Predicate } from 'fp-ts/lib/Predicate'
import * as T from 'fp-ts/lib/Task'
import * as TE from 'fp-ts/lib/TaskEither'
import { httplogger, logger } from './logging'

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
    validateStatus: (code) => code < 500,
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

export class FetchError extends Error {
  readonly tag = 'FetchError'

  public static is(a: unknown): a is FetchError {
    return a instanceof FetchError
  }

  public static create(message: string): FetchError {
    return new FetchError(message)
  }
}

export const fetchClient: FetchClientEither = (config) =>
  TE.tryCatch(
    async () => {
      httplogger.debug({
        url: config.url,
        headers: config.headers,
        data: config.data,
      })

      const res = await _client(config)

      httplogger.debug({
        status: res.status,
        headers: res.headers,
        data: res.data,
      })

      return res
    },
    (error) => {
      httplogger.debug('error')
      if (axios.isAxiosError(error)) {
        httplogger.debug(error.response)
      }
      return new FetchError(`Error fetching: ${String(error)}`)
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
