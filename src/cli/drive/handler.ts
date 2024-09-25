import { flow, pipe } from "fp-ts/lib/function";
import * as RTE from "fp-ts/lib/ReaderTaskEither";
import * as TE from "fp-ts/TaskEither";
import { DrivePersistence } from "idrive-lib";
import * as Log from "idrive-lib/logging";
import * as w from "yargs-command-wrapper";
import { CliCommands, cmd } from "./args";
import * as Commands from "./commands";

export { cmd };

const handler = w.createHandlerFor(cmd, {
  ls: DrivePersistence.persistentDriveState(Commands.listUnixPath),
  mkdir: DrivePersistence.persistentDriveState(Commands.mkdir),
  rm: DrivePersistence.persistentDriveState(Commands.rm),
  upload: cmd => DrivePersistence.persistentDriveState(Commands.upload)(cmd),
  mv: DrivePersistence.persistentDriveState(Commands.move),
  autocomplete: DrivePersistence.persistentDriveState(Commands.autocomplete),
  ac: DrivePersistence.persistentDriveState(Commands.autocomplete),
  cat: DrivePersistence.persistentDriveState(Commands.cat),
  recover: DrivePersistence.persistentDriveState(Commands.recover),
  download: DrivePersistence.persistentDriveState(Commands.download),
  edit: DrivePersistence.persistentDriveState(Commands.edit),
  init: Commands.initSession,
  auth: Commands.authSession,
});

export const runCommand = (command: CliCommands): RTE.ReaderTaskEither<CommandsDeps, Error, string> => {
  return pipe(
    handler.handle(command),
    Log.debugTimeRTE("runCliCommand")<CommandsDeps, Error, string>,
  );
};

/** Aggregate all dependencies of all commands into a single record */
export type CommandsDeps = ReturnType<typeof handler.handle> extends RTE.ReaderTaskEither<infer R, unknown, unknown> ? R
  : never;

export const printResult = flow(
  TE.fold(Log.printer.errorTask, (output: string) => async () => {
    if (/^\s*$/.test(output)) {
      return;
    }
    Log.printer.print(output, { newline: false });
  }),
);
