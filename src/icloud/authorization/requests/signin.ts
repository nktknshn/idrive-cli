import * as A from 'fp-ts/lib/Array'
import * as E from 'fp-ts/lib/Either'
import { flow, pipe } from 'fp-ts/lib/function'
import * as O from 'fp-ts/lib/Option'
import * as t from 'io-ts'
import { err, UnexpectedResponse } from '../../../util/errors'
import { HttpResponse } from '../../../util/http/fetch-client'
import { getHeader } from '../../../util/http/http-headers'
import { authLogger } from '../../../util/logging'
import { arrayFromOption } from '../../../util/util'
import * as AR from '../../request/request'
import { applyCookiesToSession } from '../../session/session-http'
import { headers } from '../../session/session-http-headers'
import { applyAuthorizationResponse } from '../authorization-session'
import { authorizationHeaders } from './../headers'

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

export function getResponse(
  httpResponse: HttpResponse,
  json: E.Either<Error, unknown>,
): E.Either<Error, SignInResponse> {
  if (httpResponse.status == 409) {
    if (E.isLeft(json)) {
      return json
    }

    const responseBody = json.right as SignInResponse409Body

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

export const requestSignInM = <S extends AR.BasicState>(): AR.ApiRequest<SignInResponse, S> => {
  authLogger.debug('requestSignInM')

  return pipe(
    AR.buildRequestC<S>(({ state: { session } }) => ({
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
      AR.validateHttpResponse({ validStatuses: [409, 200] }),
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
