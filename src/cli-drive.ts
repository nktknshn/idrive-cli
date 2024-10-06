#!/usr/bin/env node

import * as E from "fp-ts/lib/Either";
import { pipe } from "fp-ts/lib/function";
import * as w from "yargs-command-wrapper";

import { cmd } from "./cli/drive/args";

async function main() {
  const { result, yargs } = w.buildAndParse(cmd);

  if (E.isLeft(result)) {
    console.log(result.left.message);
    yargs.showHelp("log");
    process.exit(0);
  }

  const command = result.right;

  // TODO: optimize module loading
  // const started = process.hrtime();
  const Logging = await import("idrive-lib/logging");
  const CliDrive = await import("./cli/drive");

  // ms
  // console.log(`Loaded in ${(process.hrtime(started)[0] * 1000 + process.hrtime(started)[1] / 1000000).toFixed(2)}ms`);

  Logging.initLogging({
    debug: command.argv.debug,
    logHttp: command.argv["log-http"],
  });

  await pipe(
    CliDrive.createDeps(command.argv),
    CliDrive.runCommand(command),
    CliDrive.printResult,
  )();
}

main();
