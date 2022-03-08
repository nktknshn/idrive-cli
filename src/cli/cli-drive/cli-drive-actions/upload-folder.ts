import { Eq } from 'fp-ts/Eq'
import * as A from 'fp-ts/lib/Array'
import { flow, pipe } from 'fp-ts/lib/function'
import { isSome } from 'fp-ts/lib/Option'
import * as RTE from 'fp-ts/lib/ReaderTaskEither'
import { toArray } from 'fp-ts/lib/ReadonlyArray'
import { fst, snd } from 'fp-ts/lib/ReadonlyTuple'
import * as SRTE from 'fp-ts/lib/StateReaderTaskEither'
import * as TE from 'fp-ts/lib/TaskEither'
import * as TR from 'fp-ts/lib/Tree'
import * as NA from 'fp-ts/NonEmptyArray'
import micromatch from 'micromatch'
import { AuthorizedState } from '../../../icloud/authorization/authorize'
import { UploadResult } from '../../../icloud/drive/api'
import * as API from '../../../icloud/drive/api/methods'
import { result } from '../../../icloud/drive/api/newbuilder'
import { Use } from '../../../icloud/drive/api/type'
import * as V from '../../../icloud/drive/cache/cache-get-by-path-types'
import { CacheF } from '../../../icloud/drive/cache/cache-types'
import * as DF from '../../../icloud/drive/drive'
import { findInParentFilename } from '../../../icloud/drive/helpers'
import {
  DetailsAppLibrary,
  DetailsDocwsRoot,
  DetailsFolder,
  DriveChildrenItemFolder,
  FolderLikeItem,
  isFolderLike,
} from '../../../icloud/drive/requests/types/types'
import { itemFolder } from '../../../icloud/drive/requests/types/types-io'
import { err } from '../../../lib/errors'
import { printerIO } from '../../../lib/logging'
import { NEA, XXX } from '../../../lib/types'
import { hasOwnProperty, Path } from '../../../lib/util'
import { getDirectoryStructure, LocalTreeElement, walkDirRel } from './download/helpers'
import { normalizePath } from './helpers'

type Argv = {
  localpath: string
  remotepath: string
  dry: boolean
  include: string[]
  exclude: string[]
  // silent: boolean
}

type Deps =
  & DF.DriveMEnv
  & Use<'renameItemsM'>
  & Use<'createFoldersM'>
  & Use<'upload'>
  & Use<'fetchClient'>
  & Use<'downloadBatchM'>
  & Use<'getUrlStream'>

export const uploadFolder = (
  { localpath, remotepath, include, exclude, dry }: Argv,
): XXX<DF.State, Deps, unknown> => {
  return pipe(
    SRTE.ask<DF.State, Deps>(),
    SRTE.bindTo('api'),
    SRTE.bindW('root', DF.getRoot),
    SRTE.bindW('dst', ({ root }) => DF.getByPathH(root, normalizePath(remotepath))),
    SRTE.bindW('src', () => SRTE.of(localpath)),
    SRTE.bindW('args', () => SRTE.of({ localpath, remotepath, include, exclude, dry })),
    SRTE.chainW(handle),
    SRTE.map((res) => `Success.`),
  )
}
const handle = (
  { src, dst, api, args }: {
    src: string
    dst: V.GetByPathResult<DetailsDocwsRoot>
    api: Deps
    args: Argv
  },
): XXX<DF.State, Deps, unknown> => {
  const dirname = Path.parse(src).base

  const task = pipe(
    walkDirRel(src),
    TE.map(createUploadTask(args)),
  )

  const go = (
    dstitem: DetailsDocwsRoot | DetailsFolder | DetailsAppLibrary,
    dirname: string,
  ) =>
    pipe(
      DF.Do,
      SRTE.bindW('task', () => SRTE.fromTaskEither(task)),
      // SRTE.chainFirstIOK(({ task }) => printerIO.print(task.uploadable)),
      SRTE.bindW('uploadRoot', () =>
        API.createFolders({
          names: [dirname],
          destinationDrivewsId: dstitem.drivewsid,
        })),
      SRTE.bindW(
        'dirs',
        ({ uploadRoot, task }) =>
          pipe(
            printerIO.print(`creating dir structure`),
            SRTE.fromIO,
            SRTE.chain(() => createDirStructure(uploadRoot[0].drivewsid, task.dirstruct)),
          ),
      ),
      SRTE.chainW(({ task, dirs }) => {
        return pipe(
          task.uploadable,
          A.chunksOf(5),
          A.map(uploadChumk(dirs)),
          A.sequence(SRTE.Applicative),
        )
      }),
    )

  const uploadChumk = (
    dirs: Record<string, string>,
  ) =>
    (chunk: NEA<readonly [string, LocalTreeElement]>): DF.DriveM<UploadResult> =>
      state =>
        pipe(
          chunk,
          NA.map(([remotepath, element]) =>
            pipe(
              api.upload<DF.State>({
                sourceFilePath: Path.join(src, element.path),
                docwsid: parseDrivewsid(dirs[Path.dirname(remotepath)]).docwsid,
                zone: parseDrivewsid(dirs[Path.dirname(remotepath)]).zone,
              })(state),
              RTE.chainFirstIOK(() => printerIO.print(`${remotepath}`)),
            )
          ),
          NA.sequence(RTE.ApplicativePar),
          RTE.map(NA.last),
        )

  if (dst.valid) {
    const dstitem = V.target(dst)

    if (isFolderLike(dstitem)) {
      if (isSome(findInParentFilename(dstitem, dirname))) {
        return SRTE.left(err(`${args.remotepath} already contains directory named ${dirname}`))
      }

      if (args.dry) {
        return SRTE.fromTaskEither(pipe(
          task,
          TE.chainIOK(
            ({ uploadable, excluded, empties }) =>
              printerIO.print(
                `excluded:\n${excluded.map(fst).join('\n').length} items\n\nempties:\n${
                  empties.map(fst).join('\n')
                }\n\nuploadable:\n${uploadable.map(fst).join('\n')}`,
              ),
          ),
        ))
      }

      return go(dstitem, dirname)
    }
  }
  else if (dst.path.rest.length == 1) {
    const dstitem = NA.last(dst.path.details)
    const fname = NA.head(dst.path.rest)

    return go(dstitem, fname)
  }

  return SRTE.left(err(`invalid location`))
}

const createUploadTask = (
  { exclude, include }: { include: string[]; exclude: string[] },
) =>
  (
    tree: TR.Tree<LocalTreeElement>,
  ) => {
    const flatTree = pipe(
      tree,
      TR.reduce([] as (readonly [string, LocalTreeElement])[], (acc, cur) => [...acc, [cur.path, cur] as const]),
    )

    const files = pipe(
      flatTree,
      A.filter(flow(snd, _ => _.type === 'file')),
    )

    // const folders = pipe(
    //   flatTree,
    //   A.filter(flow(snd, _ => _.type === 'directory')),
    // )

    const { left: excluded, right: valid } = pipe(
      files,
      A.partition(
        ([path, item]) =>
          (include.length == 0 || micromatch.any(path, include, { dot: true }))
          && (exclude.length == 0 || !micromatch.any(path, exclude, { dot: true })),
      ),
    )

    const { left: uploadable, right: empties } = pipe(
      valid,
      A.partition(([, file]) => file.stats.size == 0),
    )

    const dirstruct = pipe(
      A.concat(uploadable)(empties),
      A.map(a => a[0]),
      getDirectoryStructure,
    )

    return {
      dirstruct,
      uploadable,
      empties,
      excluded,
    }
  }

export const getSubdirsPerParent = (parent: string) =>
  (struct: string[]): (readonly [string, string])[] => {
    const kids = pipe(
      struct,
      A.map(Path.parse),
      A.filter(_ => _.dir == parent),
      A.map(_ => [parent, _.base] as const),
    )

    const subkids = pipe(
      kids,
      A.map(([p, k]) => getSubdirsPerParent(Path.join(p, k))(struct)),
      A.flatten,
    )

    return [...kids, ...subkids]
  }
const group = <A>(S: Eq<A>): ((as: Array<A>) => Array<Array<A>>) => {
  return A.chop(as => {
    const { init, rest } = pipe(as, A.spanLeft((a: A) => S.equals(a, as[0])))
    return [init, rest]
  })
}

const createDirStructure = (
  dstitemDrivewsid: string,
  dirstruct: string[],
): XXX<DF.State, Use<'createFoldersM'>, Record<string, string>> => {
  const task = pipe(
    getSubdirsPerParent('/')(dirstruct),
    group<readonly [string, string]>({
      equals: (a, b) => a[0] == b[0],
    }),
    A.map(chunk => [chunk[0][0], A.map(snd)(chunk)] as const),
  )

  const dirToIdMap: Record<string, string> = {
    '/': dstitemDrivewsid,
  }

  return pipe(
    task,
    A.reduce(
      SRTE.of(dirToIdMap),
      (acc, [parent, names]) =>
        pipe(
          acc,
          SRTE.chain((dirToIdMap) =>
            pipe(
              printerIO.print(`creating ${names} in ${parent}`),
              SRTE.fromIO,
              SRTE.chain(() =>
                API.createFolders<DF.State>({
                  destinationDrivewsId: dirToIdMap[parent],
                  names,
                })
              ),
              SRTE.map(A.zip(names)),
              SRTE.map(
                A.reduce(dirToIdMap, (a, [item, name]) => ({
                  ...a,
                  [Path.join(parent, name)]: item.drivewsid,
                })),
              ),
            )
          ),
        ),
    ),
  )
}

const parseDrivewsid = (drivewsid: string) => {
  const [type, zone, docwsid] = drivewsid.split('::')
  return { type, zone, docwsid }
}
