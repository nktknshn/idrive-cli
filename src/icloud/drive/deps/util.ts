import * as TE from 'fp-ts/TaskEither'
import { FetchClientEither } from '../../../lib/http/fetch-client'

export type DepFetchClient = { fetchClient: FetchClientEither }
// export type DepChildProcess = { spawn: FetchClientEither }

export type DepAskConfirmation = {
  askConfirmation: ({ message }: {
    message: string
  }) => TE.TaskEither<Error, boolean>
}
