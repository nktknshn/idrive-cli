import { pipe } from "fp-ts/lib/function";
import * as TE from 'fp-ts/lib/TaskEither';
import { FetchClientEither } from '../../lib/fetch-client';
import { logger } from "../../lib/logging";
import { arrayFromOption } from "../../lib/util";
import { ICloudSessionState } from "../session/session";
import { requestAccoutLogin } from "./accoutLogin";
import { AccountLoginResponseBody } from "./accoutLoginResponseType";
import { requestSecurityCode } from "./securitycode";
import { hsa2Required, requestSignIn } from "./signin";
import { requestTrustDevice } from "./trust";

export interface AuthorizeProps {
    client: FetchClientEither,
    getCode: TE.TaskEither<Error, string>,
    session: ICloudSessionState
}

export interface ICloudSessionValidated {
    session: ICloudSessionState;
    accountData: AccountLoginResponseBody
}

export function authorizeSession({
    client, session, getCode
}: AuthorizeProps): TE.TaskEither<Error, ICloudSessionValidated> {
    logger.debug('authorizeSession')

    return pipe(
        requestSignIn(client, session, {
            accountName: session.username,
            password: session.password,
            trustTokens: arrayFromOption(session.trustToken)
        }),
        TE.map(({ session, response }) => ({
            session,
            hsa2: hsa2Required(response.body)
        })),
        TE.chainW(({ session, hsa2 }) => hsa2
            ? pipe(
                getCode,
                TE.chainW(code => requestSecurityCode({ client, session, code })),
                TE.chainW(({ session }) => requestTrustDevice(client, session)),
                TE.map(_ => _.session))
            : TE.of(session)
        ),
        TE.chainW(session => requestAccoutLogin(client, session))
    )
}
