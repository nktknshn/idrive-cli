import * as E from "fp-ts/lib/Either";
import { pipe } from "fp-ts/lib/function";
import * as TE from "fp-ts/lib/TaskEither";
import * as w from "yargs-command-wrapper";

import * as CliDrive from "./cli/drive";
import * as Log from "./logging";
import { printer } from "./logging/printerIO";

async function main() {
  const { result, yargs } = w.buildAndParse(CliDrive.cmd);

  if (E.isLeft(result)) {
    console.log(result.left.message);
    yargs.showHelp("log");
    process.exit(0);
  }

  const command = result.right;

  Log.initLogging(command.argv, Log.defaultLoggers);

  await pipe(
    CliDrive.createCliCommandsDeps(command.argv),
    CliDrive.runCliCommand(command),
    Log.debugTimeTE("runCliCommand"),
    TE.fold(printer.errorTask, (output) =>
      async () => {
        if (output === undefined) {
          return;
        }

        if (output == "\n") {
          return;
        }

        printer.print(output, { newline: false });
      }),
  )();
}

main();
