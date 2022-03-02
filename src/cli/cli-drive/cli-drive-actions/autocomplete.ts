import { pipe } from 'fp-ts/lib/function'
import * as DF from '../../../icloud/drive/drive'
import { fileName, fileNameAddSlash } from '../../../icloud/drive/requests/types/types'
import { logger } from '../../../lib/logging'
import { Path } from '../../../lib/util'
import { normalizePath } from './helpers'

export const autocomplete = ({ path, trash, file, dir, cached }: {
  path: string
  trash: boolean
  file: boolean
  dir: boolean
  cached: boolean
}) => {
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
    DF.getCachedRoot(trash),
    DF.chain(root =>
      pipe(
        cached
          ? DF.getByPathFolderCached(targetDir)(root)
          : DF.getByPathFolder(root, targetDir),
        DF.map(parent =>
          lookupDir
            ? parent.items
            : parent.items.filter(
              f => fileName(f).startsWith(childName),
            )
        ),
        DF.logS(
          result => `suggestions: ${result.map(fileName)}`,
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
}
