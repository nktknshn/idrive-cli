import * as TE from 'fp-ts/TaskEither'

export type DepAskConfirmation = {
  askConfirmation: ({ message }: { message: string }) => TE.TaskEither<Error, boolean>
}
