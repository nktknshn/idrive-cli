import { pipe } from 'fp-ts/lib/function'
import * as R from 'fp-ts/lib/Reader'
import { defaultApiEnv } from '../../defaults'
import { DepAskConfirmation, DepFetchClient } from '../../icloud/drive/deps'
import { ApiCreator, defaultApiCreator } from '../../icloud/drive/deps/api-creator'
import * as fs from '../../lib/fs'
import * as Action from './cli-drive-actions'

export const cliActionsDependencies = <ApiCreatorEnv>() =>
  pipe(
    R.ask<
      & DepFetchClient
      & DepAskConfirmation
      & { tempdir: string }
      & { sessionFile: string }
      & { cacheFile: string; noCache: boolean }
      & { fs: fs.FsType }
    >(),
    R.bindW('api', () => R.asksReaderW((c: { apiCreator: ApiCreator<ApiCreatorEnv> }) => c.apiCreator)),
    // R.bindW('fs', () => R.of(fs)),
  )
