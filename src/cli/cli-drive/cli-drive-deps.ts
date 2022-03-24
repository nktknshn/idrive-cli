import { pipe } from 'fp-ts/lib/function'
import * as R from 'fp-ts/lib/Reader'
import { ApiCreator } from '../../icloud/drive/deps/api-creator'
import { DepAskConfirmation, DepFetchClient } from '../../icloud/drive/deps/deps'
import * as fs from '../../lib/fs'
import * as Action from './cli-drive-actions'

export const cliActionsDependancies = <ApiCreatorEnv>() =>
  pipe(
    R.ask<DepFetchClient & DepAskConfirmation & { tempdir: string }>(),
    R.bindW('api', () => R.asksReaderW((c: { apiCreator: ApiCreator<ApiCreatorEnv> }) => c.apiCreator)),
    R.bindW('fs', () => R.of(fs)),
  )
