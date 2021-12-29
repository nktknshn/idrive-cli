import axios, { AxiosError, AxiosRequestConfig, AxiosResponse, Method } from 'axios'
import FormData from 'form-data'
import { Predicate } from 'fp-ts/lib/Predicate'
import * as TE from 'fp-ts/lib/TaskEither'
import { httplogger } from '../logging'

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
      httplogger.debug({
        url: config.url,
        // headers: config.headers,
        request: config.data,
      })

      const res = await _client(config)

      httplogger.debug({
        status: res.status,
        // headers: res.headers,
        response: res.data,
      })

      return res
    },
    (error) => {
      httplogger.debug('error')
      if (axios.isAxiosError(error)) {
        httplogger.debug(error.response)
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

  public static is(a: unknown): a is FetchError {
    return a instanceof FetchError
  }

  public static create(message: string, axiosError?: AxiosError): FetchError {
    return new FetchError(message, axiosError)
  }
}

// export class FetchErrorAxios extends Error {
//   public static is(a: unknown): a is FetchErrorAxios {
//     return a instanceof FetchErrorAxios
//   }

//   public static create(message: string, axiosError?: AxiosError): FetchErrorAxios {
//     return new FetchErrorAxios(message, axiosError?: AxiosError)
//   }
// }
