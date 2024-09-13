import { constVoid, pipe } from "fp-ts/lib/function";
import * as O from "fp-ts/Option";
import * as SRTE from "fp-ts/StateReaderTaskEither";
import * as defaults from "../../defaults";
import * as deps from "../../deps-providers";

import { DepAskConfirmation } from "../../deps-types/dep-ask-confirmation";
import { Cache, DriveLookup } from "../../icloud-drive";
import { saveDriveStateToFiles } from "../../icloud-drive/drive-persistence";
import { loggerIO } from "../../logging";
import { getEnv } from "../../util/env";
import { appendFilename } from "../../util/filename";
import { CommandsDeps } from ".";

/** Create dependencies for the commands */
export const createCliCommandsDeps = (args: {
  "session-file"?: string;
  "cache-file"?: string;
  "no-cache"?: boolean;
  tempdir?: string;
  fileEditor?: string;
  askConfirmation?: DepAskConfirmation["askConfirmation"];
  "api-usage"?: DriveLookup.ApiUsage;
}): CommandsDeps => {
  const sessionFile = pipe(
    O.fromNullable(args["session-file"]),
    O.orElse(() => getEnv(defaults.envSessionFileKey)),
    O.getOrElse(() => defaults.sessionFile),
  );

  const cacheFile = args["cache-file"] ?? appendFilename(sessionFile, ".cache");
  const noCache = args["no-cache"] ?? false;

  return ({
    api: deps.api,
    fs: deps.fs,
    authenticateSession: deps.authenticateSession,
    fetchClient: deps.fetchClient,
    askConfirmation: args.askConfirmation ?? deps.askConfirmation,
    sessionFile,
    cacheFile,
    noCache,
    tempdir: args.tempdir ?? defaults.tempDir,
    apiUsage: args["api-usage"] ?? defaults.apiUsage,

    // save state by chaining DriveLookup.persistState
    // unused for now
    hookPesistState: pipe(
      DriveLookup.getState(),
      SRTE.chainFirstIOK(
        ({ cache }) => loggerIO.debug(`Saving state. Cache has ${Cache.keysCount(cache)} keys`),
      ),
      SRTE.chainTaskEitherK(cache =>
        saveDriveStateToFiles(cache)({
          sessionFile,
          cacheFile,
          noCache,
          fs: deps.fs,
        })
      ),
      SRTE.map(constVoid),
    ),
  });
};
