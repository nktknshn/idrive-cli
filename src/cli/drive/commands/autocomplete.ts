import { pipe } from 'fp-ts/lib/function'
import * as SRTE from 'fp-ts/lib/StateReaderTaskEither'
import { DriveLookup } from '../../../icloud-drive'
import { fileName, fileNameAddSlash } from '../../../icloud-drive/drive-types'
import { logger } from '../../../logging/logging'
import { normalizePath } from '../../../util/normalize-path'
import { Path } from '../../../util/path'

export const autocomplete = ({ path, trash, file, dir, cached }: {
  path: string
  trash: boolean
  file: boolean
  dir: boolean
  cached: boolean
}): DriveLookup.Lookup<string> => {
  const npath = normalizePath(path)
  const nparentPath = normalizePath(Path.dirname(path))

  const childName = Path.basename(path)

  const lookupDir = path.endsWith('/')

  logger.debug(`looking for ${childName}* in ${nparentPath} (${lookupDir})`)

  const targetDir = lookupDir ? npath : nparentPath

  return pipe(
    DriveLookup.getCachedRoot(trash),
    SRTE.chain(root =>
      pipe(
        cached
          ? DriveLookup.getByPathFolderFromCache(targetDir)(root)
          : DriveLookup.getByPathFolderStrict(root, targetDir),
        SRTE.map(parent =>
          lookupDir
            ? parent.items
            : parent.items.filter(
              f => fileName(f).startsWith(childName),
            )
        ),
        // Drive.logS(
        //   result => `suggestions: ${result.map(fileName)}`,
        // ),
        SRTE.map((result) =>
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
