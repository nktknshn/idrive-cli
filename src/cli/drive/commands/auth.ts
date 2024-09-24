import { pipe } from "fp-ts/lib/function";
import * as RTE from "fp-ts/lib/ReaderTaskEither";
import { Auth, DepsTypes, DrivePersistence } from "idrive-lib";

export type DepsAuthSession =
  & { sessionFile: string }
  & DepsTypes.DepAuthenticateSession
  & DepsTypes.DepFs<"fstat">
  & DepsTypes.DepFs<"writeFile">
  & DepsTypes.DepFs<"readFile">;

export const authSession = (): RTE.ReaderTaskEither<DepsAuthSession, Error, string> => {
  return pipe(
    RTE.ask<DepsAuthSession>(),
    RTE.chainTaskEitherK(DrivePersistence.loadSessionFromFile),
    RTE.chainW(Auth.authenticateState),
    RTE.chainFirstW(DrivePersistence.saveAccountDataToFile),
    RTE.chainFirstW(DrivePersistence.saveSessionToFile),
    RTE.map(() => ""),
  );
};
