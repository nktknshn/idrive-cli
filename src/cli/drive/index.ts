import * as RTE from "fp-ts/lib/ReaderTaskEither";
import * as w from "yargs-command-wrapper";
import { persistentDriveState } from "../../icloud-drive/drive-persistence";
import { CliCommands, cmd } from "./args";
import * as Commands from "./commands";

export { cmd };
export { createCliCommandsDeps } from "./deps";

const handler = w.createHandlerFor(cmd, {
  ls: persistentDriveState(Commands.listUnixPath),
  mkdir: persistentDriveState(Commands.mkdir),
  rm: persistentDriveState(Commands.rm),
  upload: cmd => persistentDriveState(Commands.upload)(cmd),
  mv: persistentDriveState(Commands.move),
  autocomplete: persistentDriveState(Commands.autocomplete),
  ac: persistentDriveState(Commands.autocomplete),
  cat: persistentDriveState(Commands.cat),
  recover: persistentDriveState(Commands.recover),
  download: persistentDriveState(Commands.download),
  edit: persistentDriveState(Commands.edit),
  init: Commands.initSession,
  auth: Commands.authSession,
});

export const runCliCommand = (command: CliCommands): RTE.ReaderTaskEither<CommandsDeps, Error, unknown> => {
  return handler.handle(command);
};

/** Aggregate all dependencies of all commands into a single record */
export type CommandsDeps = ReturnType<typeof handler.handle> extends RTE.ReaderTaskEither<infer R, unknown, unknown> ? R
  : never;
