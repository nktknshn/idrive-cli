import * as defaults from '../../defaults'
import { DepAskConfirmation } from '../../icloud/deps'
import { authorizeSessionMethod } from '../../icloud/drive/deps/authorize'
import { ActionsDeps } from '.'

export const createCliActionsDeps = (argv: {
  sessionFile?: string
  cacheFile?: string
  noCache?: boolean
  tempdir?: string
  fileEditor?: string
  askConfirmation?: DepAskConfirmation['askConfirmation']
}): ActionsDeps => ({
  api: defaults.api,
  fs: defaults.fs,
  authorizeSession: authorizeSessionMethod(defaults.apiEnv),
  // ...defaults.apiEnv,
  fetchClient: defaults.apiEnv.fetchClient,
  // clientInfo: defaults.clientInfo,
  sessionFile: argv.sessionFile ?? defaults.sessionFile,
  cacheFile: argv.cacheFile ?? defaults.cacheFile,
  noCache: argv.noCache ?? false,
  askConfirmation: argv.askConfirmation ?? defaults.askConfirmation,
  tempdir: argv.tempdir ?? defaults.tempDir,
  fileEditor: argv.fileEditor ?? defaults.fileEditor,
})

// export const cliActionsDependencies = <ApiCreatorEnv>() =>
//   pipe(
//     R.ask<
//       & DepFetchClient
//       & DepAskConfirmation
//       & { tempdir: string }
//       & { sessionFile: string }
//       & { cacheFile: string; noCache: boolean }
//       & { fs: fs.FsType }
//     >(),
//     R.bindW('api', () =>
//       R.asksReaderW((c: {
//         apiCreator: ApiCreator<ApiCreatorEnv>
//       }) => c.apiCreator)),
//     // R.bindW('fs', () => R.of(fs)),
//   )
