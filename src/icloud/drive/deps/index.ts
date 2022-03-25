export * as Api from './api-methods'
export { ApiType } from './api-type'

import * as TE from 'fp-ts/TaskEither'
import { FsType } from '../../../lib/fs'
import { FetchClientEither } from '../../../lib/http/fetch-client'
import { ApiType } from './api-type'

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
