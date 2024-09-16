import * as TE from "fp-ts/TaskEither";

export type DepAskConfirmation = {
  askConfirmation({ message }: { message: string }): TE.TaskEither<Error, boolean>;
  askConfirmation({ message, options }: { message: string; options: string[] }): TE.TaskEither<Error, string>;
  askConfirmation({ message }: { message: string; options?: string[] }): TE.TaskEither<Error, string | boolean>;
};
