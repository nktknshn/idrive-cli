import * as A from 'fp-ts/lib/Array'
import * as E from 'fp-ts/lib/Either'
import { apply, flow, pipe } from 'fp-ts/lib/function'
import * as O from 'fp-ts/lib/Option'
import * as TE from 'fp-ts/lib/TaskEither'
import * as t from 'io-ts'
import { err, UnexpectedResponse } from '../../lib/errors'
import { FetchClientEither, HttpResponse } from '../../lib/http/fetch-client'
import { getHeader } from '../../lib/http/http-headers'
import { authLogger } from '../../lib/logging'
import { arrayFromOption } from '../../lib/util'
import {
  applyToSession2,
  decodeJsonEither,
  filterStatuses,
  ResponseWithSession,
  returnEither,
  withResponse,
} from '../drive/requests/http'
import * as AR from '../drive/requests/reader'
import { ICloudSession } from '../session/session'
import { applyCookiesToSession, buildRequest } from '../session/session-http'
import { headers } from '../session/session-http-headers'
import { authorizationHeaders } from './headers'
import { applyAuthorizationResponse } from './session'

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

export const isHsa2Required = (
  response: SignInResponse,
): response is SignInResponse409 & { hsa2Required: true } =>
  response.tag === 'SignInResponse409' && response.authType == 'hsa2'

function getResponse(
  httpResponse: HttpResponse,
  json: E.Either<Error, unknown>,
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

const applyResponse = flow(
  withResponse,
  filterStatuses([409, 200]),
  decodeJsonEither(v => t.partial({ authType: t.string }).decode(v)),
  applyToSession2(({ httpResponse }) =>
    flow(
      applyAuthorizationResponse(httpResponse),
      applyCookiesToSession(httpResponse),
    )
  ),
  returnEither(_ => getResponse(_.httpResponse, _.decoded)),
)

export function requestSignIn(
  client: FetchClientEither,
  session: ICloudSession,
  { accountName, password, trustTokens }: {
    accountName: string
    password: string
    trustTokens: string[]
  },
): TE.TaskEither<Error, ResponseWithSession<SignInResponse>> {
  authLogger.debug('requestSignIn')

  return pipe(
    session,
    buildRequest(
      'POST',
      'https://idmsa.apple.com/appleauth/auth/signin?isRememberMeEnabled=true',
      {
        addClientInfo: false,
        headers: [headers.default, authorizationHeaders],
        data: { accountName, password, trustTokens, rememberMe: true },
      },
    ),
    client,
    TE.map(applyResponse),
    TE.chain(apply(session)),
  )
}

export function requestSignInM(
  // { accountName, password, trustTokens }: {
  //   accountName: string
  //   password: string
  //   trustTokens: string[]
  // },
): AR.AuthorizationApiRequest<SignInResponse> {
  return pipe(
    AR.buildRequestC(({ state: { session } }) => ({
      method: 'POST',
      url: 'https://idmsa.apple.com/appleauth/auth/signin?isRememberMeEnabled=true',
      options: {
        addClientInfo: false,
        headers: [headers.default, authorizationHeaders],
        data: {
          accountName: session.username,
          password: session.password,
          trustTokens: arrayFromOption(session.trustToken),
          rememberMe: true,
        },
      },
    })),
    AR.handleResponse(flow(
      AR.validateHttpResponse({ statuses: [409, 200] }),
      AR.decodeJsonEither(v => t.partial({ authType: t.string }).decode(v)),
      AR.applyToSession(({ httpResponse }) =>
        flow(
          applyAuthorizationResponse(httpResponse),
          applyCookiesToSession(httpResponse),
        )
      ),
      AR.chain(_ => AR.fromEither(getResponse(_.httpResponse, _.decoded))),
    )),
  )
}
