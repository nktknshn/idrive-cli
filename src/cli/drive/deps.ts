import { constVoid, pipe } from "fp-ts/lib/function";
import * as O from "fp-ts/Option";
import * as SRTE from "fp-ts/StateReaderTaskEither";
import * as deps from "idrive-lib/deps-providers";
import * as defaults from "../../defaults";

import { Cache, DepsTypes, DriveLookup, DrivePersistence, Logging } from "idrive-lib";
import { CommandsDeps } from "./handler";

import { appendFilename } from "idrive-lib/util/filename";
import { getEnv } from "../../util/env";

/** Create dependencies for the commands */
export const createDeps = (args: {
  "session-file"?: string;
  "cache-file"?: string;
  "no-cache"?: boolean;
  tempdir?: string;
  fileEditor?: string;
  askConfirmation?: DepsTypes.DepAskConfirmation["askConfirmation"];
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
    /** iCloud Drive API methods */
    api: deps.api,
    /** iCloud authentication */
    authenticateSession: deps.authenticateSession,
    /** File system methods */
    fs: deps.fs,
    /** Fetch client */
    fetchClient: deps.fetchClient,
    /** Asking user for confirmation */
    askConfirmation: args.askConfirmation ?? deps.askConfirmation,
    // parameters
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
        ({ cache }) => Logging.loggerIO.debug(`Saving state. Cache has ${Cache.keysCount(cache)} keys`),
      ),
      SRTE.chainTaskEitherK(cache =>
        DrivePersistence.saveDriveStateToFiles(cache)({
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
