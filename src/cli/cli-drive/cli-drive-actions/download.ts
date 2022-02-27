import assert from 'assert'
import * as A from 'fp-ts/lib/Array'
import { pipe } from 'fp-ts/lib/function'
import * as TE from 'fp-ts/lib/TaskEither'
import { defaultApiEnv } from '../../../defaults'
import * as API from '../../../icloud/drive/api'
import * as DF from '../../../icloud/drive/ffdrive'
import { cliActionM2 } from '../../../icloud/drive/ffdrive/cli-action'
import { searchGlobs } from '../../../icloud/drive/ffdrive/search-globs'
import { consumeStreamToString, getUrlStream } from '../../../icloud/drive/requests/download'
import { isFile } from '../../../icloud/drive/requests/types/types'
import { err } from '../../../lib/errors'
import { logger } from '../../../lib/logging'

export const download = (
  { sessionFile, cacheFile, paths, noCache, structured }: {
    paths: string[]
    noCache: boolean
    sessionFile: string
    cacheFile: string
    structured: boolean
    glob: boolean
    raw: boolean
  },
) => {
  assert(A.isNonEmpty(paths))

  logger.debug(`download: ${pipe(paths)}`)

  const action = () => {
    return pipe(
      searchGlobs(paths),
      DF.map(JSON.stringify),
    )
  }

  return pipe(
    { sessionFile, cacheFile, noCache, ...defaultApiEnv },
    cliActionM2(action),
  )
}
