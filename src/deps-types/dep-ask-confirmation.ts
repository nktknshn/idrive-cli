import * as TE from "fp-ts/TaskEither";

export type AskingFunc = (
  { message }: { message: string; options?: string[] },
) => TE.TaskEither<Error, string | boolean>;

export type AskConfirmationFunc = {
  ({ message }: { message: string }): TE.TaskEither<Error, boolean>;
  ({ message, options }: { message: string; options: string[] }): TE.TaskEither<Error, string>;
  (
    { message }: { message: string; options?: string[] },
  ): TE.TaskEither<Error, string | boolean>;
};

export type DepAskConfirmation = {
  askConfirmation: AskConfirmationFunc;
};
