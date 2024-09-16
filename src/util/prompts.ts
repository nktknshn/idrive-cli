import * as TE from "fp-ts/lib/TaskEither";
import prompts_ from "prompts";
import { err } from "./errors";

export const prompts = TE.tryCatchK(prompts_, (e) => err(`error: ${e}`));

import { pipe } from "fp-ts/lib/function";

export function askConfirmation({ message }: { message: string }): TE.TaskEither<Error, boolean>;
export function askConfirmation(
  { message, options }: { message: string; options: string[] },
): TE.TaskEither<Error, string>;
export function askConfirmation(
  { message, options }: { message: string; options?: string[] },
): TE.TaskEither<Error, string | boolean> {
  if (options) {
    return pipe(
      prompts({
        type: "select",
        name: "value",
        message,
        choices: options.map(o => ({ title: o, value: o })),
      }, {
        onCancel: () => process.exit(1),
      }),
      TE.map(_ => {
        return _.value as string;
      }),
    );
  }

  return pipe(
    prompts({
      type: "confirm",
      name: "value",
      message,
    }, {
      onCancel: () => process.exit(1),
    }),
    TE.map(_ => {
      return _.value as boolean;
    }),
  );
}

export function input({
  message,
}: {
  message: string;
}): TE.TaskEither<Error, number> {
  return pipe(
    prompts({
      type: "text",
      name: "value",
      message,
    }, {
      onCancel: () => process.exit(1),
    }),
    TE.map(_ => {
      return _.value as number;
    }),
  );
}

export type Getcode = () => TE.TaskEither<Error, number>;
