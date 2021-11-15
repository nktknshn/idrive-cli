import * as A from 'fp-ts/lib/Array'
import * as E from 'fp-ts/lib/Either'
import { pipe } from 'fp-ts/lib/function'
import * as O from 'fp-ts/lib/Option'
import * as TE from 'fp-ts/lib/TaskEither'
import { err, InvalidJsonInResponse, MissingResponseBody, UnexpectedResponse } from '../../lib/errors'
import { FetchClientEither, HttpResponse } from '../../lib/fetch-client'
import { getHeader } from '../../lib/http-headers'
import { logger } from '../../lib/logging'
import { applyCookies, createHttpResponseReducer1, ResponseWithSession } from '../../lib/response-reducer'
import { ICloudSession } from '../session/session'
import { applyAuthorizationResponse, buildRequest } from '../session/session-http'
import { headers } from '../session/session-http-headers'
import { authorizationHeaders } from './headers'

type SignInResponse = SignInResponse409 | SignInResponse200

type SignInResponse409Body = {
  authType?: string
}

interface SignInResponse409 {
  readonly tag: 'SignInResponse409'
  twoSVTrustEligible?: boolean
  hsa2Required: boolean
  authType: string
}

interface SignInResponse200 {
  readonly tag: 'SignInResponse200'
}

export const hsa2Required = (
  response: SignInResponse,
): response is SignInResponse409 & { hsa2Required: true } =>
  response.tag === 'SignInResponse409' && response.authType == 'hsa2'

function getResponse(
  httpResponse: HttpResponse,
  json: E.Either<MissingResponseBody | InvalidJsonInResponse, unknown>,
): E.Either<Error, SignInResponse> {
  if (httpResponse.status == 409) {
    if (E.isLeft(json)) {
      return json
    }

    const responseBody: SignInResponse409Body = json.right as SignInResponse409Body

    if (typeof responseBody.authType !== 'string') {
      return E.left(err('SignInResponse409Body: missing authType'))
    }

    const twoSVTrustEligible = pipe(
      httpResponse,
      getHeader('X-Apple-TwoSV-Trust-Eligible'),
      A.head,
      O.map(Boolean),
      O.toUndefined,
    )

    return E.right({
      authType: responseBody.authType,
      twoSVTrustEligible,
      hsa2Required: responseBody.authType == 'hsa2',
      tag: 'SignInResponse409' as const,
    })
  }
  else if (httpResponse.status == 200) {
    return E.right({ tag: 'SignInResponse200' })
  }

  return E.left(new UnexpectedResponse(httpResponse, json))
}

export function requestSignIn(
  client: FetchClientEither,
  session: ICloudSession,
  { accountName, password, trustTokens }: {
    accountName: string
    password: string
    trustTokens: string[]
  },
): TE.TaskEither<Error, ResponseWithSession<SignInResponse>> {
  logger.debug('requestSignIn')

  return pipe(
    session,
    buildRequest(
      'POST',
      'https://idmsa.apple.com/appleauth/auth/signin?isRememberMeEnabled=true',
      {
        headers: [headers.default, authorizationHeaders],
        data: { accountName, password, trustTokens, rememberMe: true },
      },
    ),
    client,
    pipe(
      session,
      createHttpResponseReducer1(
        getResponse,
        (session, httpResponse) =>
          pipe(
            session,
            applyAuthorizationResponse(httpResponse),
            applyCookies(httpResponse),
          ),
      ),
    ),
  )
}
