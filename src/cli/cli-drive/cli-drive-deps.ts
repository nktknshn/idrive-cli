import * as defaults from '../../defaults'
import * as deps from '../../deps-providers'
import { DepAskConfirmation } from '../../deps-types/DepAskConfirmation'
import { ActionsDeps } from '.'

export const createCliActionsDeps = (argv: {
  sessionFile?: string
  cacheFile?: string
  noCache?: boolean
  tempdir?: string
  fileEditor?: string
  askConfirmation?: DepAskConfirmation['askConfirmation']
}): ActionsDeps => ({
  api: deps.api,
  fs: deps.fs,
  authorizeSession: deps.authorizeSession,
  fetchClient: deps.fetchClient,
  askConfirmation: argv.askConfirmation ?? deps.askConfirmation,
  sessionFile: argv.sessionFile ?? defaults.sessionFile,
  cacheFile: argv.cacheFile ?? defaults.cacheFile,
  noCache: argv.noCache ?? false,
  tempdir: argv.tempdir ?? defaults.tempDir,
  fileEditor: argv.fileEditor ?? defaults.fileEditor,
})
