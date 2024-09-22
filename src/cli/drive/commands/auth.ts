import { pipe } from "fp-ts/lib/function";
import * as RTE from "fp-ts/lib/ReaderTaskEither";
import { DepAuthenticateSession, DepFs } from "../../../deps-types";
import { authenticateState } from "../../../icloud-authentication/methods";
import { saveAccountDataToFile } from "../../../icloud-drive/drive-persistence/account-data";
import { loadSessionFromFile, saveSessionToFile } from "../../../icloud-drive/drive-persistence/session";

export type DepsAuthSession =
  & { sessionFile: string }
  & DepAuthenticateSession
  & DepFs<"fstat">
  & DepFs<"writeFile">
  & DepFs<"readFile">;

export const authSession = (): RTE.ReaderTaskEither<DepsAuthSession, Error, string> => {
  return pipe(
    RTE.ask<DepsAuthSession>(),
    RTE.chainTaskEitherK(loadSessionFromFile),
    RTE.chainW(authenticateState),
    RTE.chainFirstW(saveAccountDataToFile),
    RTE.chainFirstW(saveSessionToFile),
    RTE.map(() => ""),
  );
};
