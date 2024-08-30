import { pipe } from 'fp-ts/lib/function'
import * as O from 'fp-ts/Option'
import * as defaults from '../../defaults'
import * as deps from '../../deps-providers'
import { DepAskConfirmation } from '../../deps-types/dep-ask-confirmation'
import { getEnv } from '../../util/env'
import { appendFilename } from '../../util/filename'
import { CommandsDeps } from '.'

/** Create dependencies for the commands */
export const createCliCommandsDeps = (args: {
  sessionFile?: string
  cacheFile?: string
  noCache?: boolean
  tempdir?: string
  fileEditor?: string
  askConfirmation?: DepAskConfirmation['askConfirmation']
}): CommandsDeps => {
  const sessionFile = pipe(
    O.fromNullable(args.sessionFile),
    O.orElse(() => getEnv(defaults.envSessionFileKey)),
    O.getOrElse(() => defaults.sessionFile),
  )

  const cacheFile = appendFilename(sessionFile, '.cache')

  return ({
    api: deps.api,
    fs: deps.fs,
    authenticateSession: deps.authenticateSession,
    fetchClient: deps.fetchClient,
    askConfirmation: args.askConfirmation ?? deps.askConfirmation,
    sessionFile,
    cacheFile: args.cacheFile ?? cacheFile,
    noCache: args.noCache ?? false,
    tempdir: args.tempdir ?? defaults.tempDir,
  })
}
