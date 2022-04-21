import * as TE from 'fp-ts/TaskEither'
import { FsType } from '../../../util/fs'
import { FetchClientEither } from '../../../util/http/fetch-client'
import { ApiType } from './api-type'
export * as Api from './api-methods'

export type DepFetchClient = { fetchClient: FetchClientEither }
// export type DepChildProcess = { spawn: FetchClientEither }

export type DepAskConfirmation = {
  askConfirmation: ({ message }: {
    message: string
  }) => TE.TaskEither<Error, boolean>
}

export type DepFs<
  K extends keyof FsType,
  RootKey extends string | number | symbol = 'fs',
> = Record<
  RootKey,
  Pick<FsType, K>
>

export type DepApi<
  K extends keyof ApiType,
  RootKey extends string | number | symbol = 'api',
> = Record<
  RootKey,
  Pick<ApiType, K>
>
