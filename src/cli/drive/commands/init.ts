import { constVoid, flow, identity, pipe } from "fp-ts/lib/function";
import * as RTE from "fp-ts/lib/ReaderTaskEither";
import * as TE from "fp-ts/TaskEither";

import { Auth, Core, DepsTypes, DrivePersistence, Logging } from "idrive-lib";

import { err } from "idrive-lib/util/errors";
import { prompts } from "idrive-lib/util/prompts";

type Args = { "skip-login": boolean };

export type InitSessionDeps =
  & { sessionFile: string }
  & DepsTypes.DepAuthenticateSession
  & DepsTypes.DepFs<"fstat">
  & DepsTypes.DepFs<"writeFile">;

export const initSession = (args: Args): RTE.ReaderTaskEither<InitSessionDeps, Error, string> => {
  return pipe(
    RTE.ask<InitSessionDeps>(),
    RTE.chainFirstW(({ sessionFile, fs }) =>
      pipe(
        RTE.fromTaskEither(fs.fstat(sessionFile)),
        RTE.fold(() => RTE.of(constVoid()), () =>
          RTE.left(
            err(
              `${sessionFile} already exists. To initiate session in a different file use option '-s':\nidrive init -s another-session.json`,
            ),
          )),
      )
    ),
    RTE.chainFirstIOK(({ sessionFile }) => (Logging.printerIO.print(`Initializing session in ${sessionFile}`))),
    RTE.chainTaskEitherK(() => sessionQuest),
    !args["skip-login"]
      ? flow(
        RTE.chainW(Auth.authenticateState),
        RTE.chainFirstW(DrivePersistence.saveAccountDataToFile),
      )
      : RTE.map(identity),
    RTE.chainFirstW(DrivePersistence.saveSessionToFile),
    RTE.chainW(() => RTE.ask<InitSessionDeps>()),
    RTE.chainFirstIOK(({ sessionFile }) => Logging.printerIO.print(`Session initialized in ${sessionFile}`)),
    RTE.map(() => ""),
  );
};

const askUsername = () =>
  prompts({
    type: "text",
    name: "value",
    message: "ICloud username",
  }, {
    onCancel: () => process.exit(1),
  });

const askPassword = () =>
  prompts({
    type: "password",
    name: "value",
    message: "ICloud password",
  }, {
    onCancel: () => process.exit(1),
  });

const sessionQuest: TE.TaskEither<Error, {
  session: Core.ICloudSession;
}> = pipe(
  TE.Do,
  TE.bind("username", askUsername),
  TE.bind("password", askPassword),
  TE.map(
    ({ username, password }) => ({ session: Core.session(username.value, password.value) }),
  ),
);
