import * as A from 'fp-ts/lib/Array'
import * as E from 'fp-ts/lib/Either'
import { flow, pipe } from 'fp-ts/lib/function'
import * as O from 'fp-ts/lib/Option'
import * as SRTE from 'fp-ts/lib/StateReaderTaskEither'
import * as TE from 'fp-ts/lib/TaskEither'
import { fst } from 'fp-ts/lib/Tuple'
import { defaultApiEnv } from '../../../defaults'
import * as API from '../../../icloud/drive/api'
import * as C from '../../../icloud/drive/cache/cache'
import * as V from '../../../icloud/drive/cache/cache-get-by-path-types'
import { isDetailsCacheEntity } from '../../../icloud/drive/cache/cache-types'
import { ItemIsNotFolderError, NotFoundError } from '../../../icloud/drive/errors'
import * as DF from '../../../icloud/drive/ffdrive'
import { cliActionM2 } from '../../../icloud/drive/ffdrive/cli-action'
import { fileName, fileNameAddSlash, isDetails, Root } from '../../../icloud/drive/requests/types/types'
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
  dir,
  cached,
}: {
  path: string
  noCache: boolean
  sessionFile: string
  cacheFile: string
  trash: boolean
  file: boolean
  dir: boolean
  cached: boolean
}): TE.TaskEither<Error, string> => {
  const npath = normalizePath(path)
  const nparentPath = normalizePath(Path.dirname(path))

  const childName = Path.basename(path)

  const lookupDir = path.endsWith('/')

  logger.debug(`looking for ${childName}* in ${nparentPath} (${lookupDir})`)

  const targetDir = lookupDir ? npath : nparentPath
  /*   pipe(
    DF.lsdirCachedO(targetDir)(root),
    DF.chain(_ =>
      O.isSome(_)
        ? (new Date().getTime() - _.value.created.getTime()) > 3000
          ? DF.lsdir(root, targetDir)
          : DF.of(_.value.content)
        : DF.lsdir(root, targetDir)
    ),
  ) */
  return pipe(
    {
      sessionFile,
      cacheFile,
      noCache,
      ...defaultApiEnv,
    },
    cliActionM2(() => {
      const res = pipe(
        DF.getCachedRoot(trash),
        DF.chain(root =>
          pipe(
            cached
              ? DF.lsdirCached(targetDir)(root)
              : DF.lsdir(root, targetDir),
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
                .filter(item => dir ? item.type === 'FOLDER' || item.type === 'APP_LIBRARY' : true)
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
