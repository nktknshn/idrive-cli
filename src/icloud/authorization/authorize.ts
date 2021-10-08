import { ICloudSessionState, session } from "../session/session";
import { FetchClientEither } from '../../lib/fetch-client'
import * as TE from 'fp-ts/lib/TaskEither'
import * as E from 'fp-ts/lib/Either'
import * as O from 'fp-ts/lib/Option'
import { AccountLoginResponseBody } from "./accoutLoginResponseType";
import { logger } from "../../lib/logging";
import { pipe } from "fp-ts/lib/function";
import { hsa2Required, requestSignIn } from "./signin";
import { error, UnexpectedResponse } from "../../lib/errors";
import { requestSecurityCode,  } from "./securitycode";
import { requestTrustDevice } from "./trust";
import { AccountLoginResponse200, AccountLoginResponse421, requestAccoutLogin } from "./accoutLogin";
import { FetchError } from "../../lib/fetch-client";
import { ErrorReadingResponseBody, InvalidJsonInResponse } from "/home/horn/Workspace/Typescript/Deno/node-icloud1/src/lib/json";


export interface AuthorizeProps {
    client: FetchClientEither,
    getCode: TE.TaskEither<Error, string>,
    session: ICloudSessionState
}

export interface ICloudSessionValidated {
    session: ICloudSessionState;
    accountData: AccountLoginResponseBody
}

// function getCodeTask(getCode: () => Promise<O.Option<string>>) {
//     return pipe(
//         TE.tryCatch(getCode, (e) => error(String(e))),
//         TE.chainW(TE.fromOption(() => error('code required')))
//     )
// }

export const arrayFromOption = <T>(opt: O.Option<T>) => pipe(opt, O.fold(() => [], v => [v]))

export function authorizeSession({
    client, session, getCode
}: AuthorizeProps): TE.TaskEither<
    Error | UnexpectedResponse | FetchError | ErrorReadingResponseBody | InvalidJsonInResponse | AccountLoginResponse421,
    ICloudSessionValidated
> {
    logger.debug('authorizeSession')

    return pipe(
        requestSignIn({
            client, session,
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
                TE.chainW(({ session }) => requestTrustDevice({ client, session })),
                TE.map(_ => _.session))
            : TE.of(session)
        ),
        TE.chainW(session => requestAccoutLogin({ client, session }))
    )
}
