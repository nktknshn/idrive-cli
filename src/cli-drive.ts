import * as E from "fp-ts/lib/Either";
import { pipe } from "fp-ts/lib/function";
import { Logging } from "idrive-lib";
import * as w from "yargs-command-wrapper";

import * as CliDrive from "./cli/drive";

async function main() {
  const { result, yargs } = w.buildAndParse(CliDrive.cmd);

  if (E.isLeft(result)) {
    console.log(result.left.message);
    yargs.showHelp("log");
    process.exit(0);
  }

  const command = result.right;

  Logging.initLogging({ debug: command.argv.debug });

  await pipe(
    CliDrive.createCliCommandsDeps(command.argv),
    CliDrive.runCliCommand(command),
    CliDrive.printResult,
  )();
}

main();
