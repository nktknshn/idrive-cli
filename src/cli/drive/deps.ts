import * as defaults from '../../defaults'
import * as deps from '../../deps-providers'
import { DepAskConfirmation } from '../../deps-types/dep-ask-confirmation'
import { CommandsDeps } from '.'

/** Create dependencies for the actions from the CLI arguments */
export const createCliActionsDeps = (argv: {
  sessionFile?: string
  cacheFile?: string
  noCache?: boolean
  tempdir?: string
  fileEditor?: string
  askConfirmation?: DepAskConfirmation['askConfirmation']
}): CommandsDeps => ({
  api: deps.api,
  fs: deps.fs,
  authenticateSession: deps.authenticateSession,
  fetchClient: deps.fetchClient,
  askConfirmation: argv.askConfirmation ?? deps.askConfirmation,
  sessionFile: argv.sessionFile ?? defaults.sessionFile,
  cacheFile: argv.cacheFile ?? defaults.cacheFile,
  noCache: argv.noCache ?? false,
  tempdir: argv.tempdir ?? defaults.tempDir,
  fileEditor: argv.fileEditor ?? defaults.fileEditor,
})
