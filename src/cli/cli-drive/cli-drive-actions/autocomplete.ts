import * as A from 'fp-ts/lib/Array'
import { flow, pipe } from 'fp-ts/lib/function'
import * as O from 'fp-ts/lib/Option'
import * as SRTE from 'fp-ts/lib/StateReaderTaskEither'
import * as TE from 'fp-ts/lib/TaskEither'
import { fst } from 'fp-ts/lib/Tuple'
import { defaultApiEnv } from '../../../defaults'
import * as API from '../../../icloud/drive/api'
import * as DF from '../../../icloud/drive/ffdrive'
import { cliActionM2 } from '../../../icloud/drive/ffdrive/cli-action'
import { fileName, fileNameAddSlash } from '../../../icloud/drive/requests/types/types'
import { err } from '../../../lib/errors'
import { logger, stderrLogger } from '../../../lib/logging'
import { Path } from '../../../lib/util'
import { normalizePath } from './helpers'
import { showDetailsInfo } from './ls'

export const autocomplete = ({
  sessionFile,
  cacheFile,
  path,
  noCache,
  trash,
  file,
}: {
  path: string
  noCache: boolean
  sessionFile: string
  cacheFile: string
  trash: boolean
  file: boolean
}): TE.TaskEither<Error, string> => {
  const npath = normalizePath(path)
  const nparentPath = normalizePath(Path.dirname(path))

  const childName = Path.basename(path)

  const lookupDir = path.endsWith('/')

  logger.debug(`looking for ${childName}* in ${nparentPath} (${lookupDir})`)

  return pipe(
    {
      sessionFile,
      cacheFile,
      noCache,
      ...defaultApiEnv,
    },
    cliActionM2(() => {
      const res = pipe(
        DF.chainRoot(root =>
          pipe(
            DF.lsdir(root, lookupDir ? npath : nparentPath),
            DF.map(parent =>
              lookupDir
                ? parent.items
                : parent.items.filter(
                  f => fileName(f).startsWith(childName),
                )
            ),
            SRTE.chainFirst(
              result => SRTE.fromIO(() => logger.debug(`suggestions: ${result.map(fileName)}`)),
            ),
            DF.map((result) =>
              result
                .filter(item => file ? item.type === 'FILE' : true)
                .map(fileNameAddSlash)
                .map(fn => lookupDir ? `/${npath}/${fn}` : `/${nparentPath}/${fn}`)
                .map(Path.normalize)
                .join('\n')
            ),
          )
        ),
      )

      return res
    }),
  )
}
