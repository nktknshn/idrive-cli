import { pipe } from 'fp-ts/lib/function'
import * as R from 'fp-ts/lib/Reader'
import { apiCreator } from '../../icloud/drive/deps/api-creator'
import { DepAskConfirmation, DepFetchClient } from '../../icloud/drive/deps/deps'
import * as fs from '../../lib/fs'
import * as Action from './cli-drive-actions'

type A = keyof typeof Action

export const cliActionsDependancies = pipe(
  R.ask<DepFetchClient & DepAskConfirmation & { tempdir: string }>(),
  R.bindW('api', () => apiCreator),
  R.bindW('fs', () => R.of(fs)),
)
