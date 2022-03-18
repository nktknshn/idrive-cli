import { Eq } from 'fp-ts/Eq'
import * as A from 'fp-ts/lib/Array'
import { flow, pipe } from 'fp-ts/lib/function'
import { isSome } from 'fp-ts/lib/Option'
import * as RTE from 'fp-ts/lib/ReaderTaskEither'
import { fst, snd } from 'fp-ts/lib/ReadonlyTuple'
import * as R from 'fp-ts/lib/Record'
import * as SRTE from 'fp-ts/lib/StateReaderTaskEither'
import * as TE from 'fp-ts/lib/TaskEither'
import * as TR from 'fp-ts/lib/Tree'
import * as NA from 'fp-ts/NonEmptyArray'
import { Stats } from 'fs'
import micromatch from 'micromatch'
import * as API from '../../../icloud/drive/api/drive-api-methods'
import { Dep } from '../../../icloud/drive/api/type'
import * as V from '../../../icloud/drive/cache/cache-get-by-path-types'
import * as DF from '../../../icloud/drive/drive'
import { findInParentFilename } from '../../../icloud/drive/helpers'
import {
  DetailsAppLibrary,
  DetailsDocwsRoot,
  DetailsFolder,
  isFolderLike,
} from '../../../icloud/drive/requests/types/types'
import { err } from '../../../lib/errors'
import { printerIO } from '../../../lib/logging'
import { NEA, XXX } from '../../../lib/types'
import { Path } from '../../../lib/util'
import { getDirectoryStructure, LocalTreeElement, walkDirRel } from './download/download-helpers'
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
  & Dep<'renameItems'>
  & Dep<'createFolders'>
  & Dep<'downloadBatch'>
  & API.UploadMethodDeps

type UploadTask = {
  dirstruct: string[]
  uploadable: (readonly [string, { path: string; stats: Stats }])[]
  empties: (readonly [string, { path: string; stats: Stats }])[]
  excluded: (readonly [string, { path: string; stats: Stats }])[]
}

export type UploadResult = {
  status: { status_code: number; error_message: string }
  etag: string
  zone: string
  type: string
  document_id: string
  parent_id: string
  mtime: number
}

export const uploadFolder = (
  { localpath, remotepath, include, exclude, dry }: Argv,
): XXX<DF.State, Deps, unknown> => {
  return pipe(
    DF.getRoot(),
    SRTE.bindTo('root'),
    SRTE.bindW('dst', ({ root }) => DF.getByPathH(root, normalizePath(remotepath))),
    SRTE.bindW('src', () => SRTE.of(localpath)),
    SRTE.bindW('args', () => SRTE.of({ localpath, remotepath, include, exclude, dry })),
    SRTE.chainW(handle),
    SRTE.map((res) => `Success.`),
  )
}

const handle = (
  { src, dst, args }: {
    src: string
    dst: V.GetByPathResult<DetailsDocwsRoot>
    args: Argv
  },
): XXX<DF.State, Deps, unknown> => {
  const dirname = Path.parse(src).base

  const uploadTask = pipe(
    walkDirRel(src),
    TE.map(createUploadTask(args)),
  )

  if (args.dry) {
    return SRTE.fromTaskEither(pipe(
      uploadTask,
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

  if (dst.valid) {
    const dstitem = V.target(dst)

    if (isFolderLike(dstitem)) {
      if (isSome(findInParentFilename(dstitem, dirname))) {
        return SRTE.left(err(`${args.remotepath} already contains an item named ${dirname}`))
      }

      return pipe(
        uploadTask,
        SRTE.fromTaskEither,
        SRTE.chain(uploadToNewFolder(dstitem, dirname, src)),
      )
    }
  }
  else if (dst.path.rest.length == 1) {
    const dstitem = NA.last(dst.path.details)
    const dirname = NA.head(dst.path.rest)

    return pipe(
      uploadTask,
      SRTE.fromTaskEither,
      SRTE.chain(uploadToNewFolder(dstitem, dirname, src)),
    )
  }

  return SRTE.left(err(`invalid dest location`))
}

const createUploadTask = (
  { exclude, include }: { include: string[]; exclude: string[] },
): (
  tree: TR.Tree<LocalTreeElement>,
) => {
  dirstruct: string[]
  uploadable: (readonly [string, { path: string; stats: Stats }])[]
  empties: (readonly [string, { path: string; stats: Stats }])[]
  excluded: (readonly [string, { path: string; stats: Stats }])[]
} =>
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

const uploadToNewFolder = (
  dstitem: DetailsDocwsRoot | DetailsFolder | DetailsAppLibrary,
  dirname: string,
  src: string,
): (
  task: UploadTask,
) => SRTE.StateReaderTaskEither<
  DF.State,
  Deps,
  Error,
  NEA<UploadResult>[]
> =>
  (task: UploadTask) =>
    pipe(
      SRTE.of<DF.State, Deps, Error, UploadTask>(
        task,
      ),
      SRTE.bindTo('task'),
      SRTE.bindW('uploadRoot', () =>
        API.createFoldersFailing<DF.State>({
          names: [dirname],
          destinationDrivewsId: dstitem.drivewsid,
        })),
      SRTE.bindW(
        'dirs',
        ({ uploadRoot, task }) =>
          pipe(
            printerIO.print(`creating dir structure`),
            SRTE.fromIO,
            SRTE.chain(() =>
              createDirStructure(
                uploadRoot[0].drivewsid,
                task.dirstruct,
              )
            ),
          ),
      ),
      SRTE.chainW(({ task, dirs }) => {
        return pipe(
          task.uploadable,
          A.map(([remotepath, c]) => [remotepath, { ...c, path: Path.join(src, c.path) }] as const),
          A.chunksOf(5),
          A.map(uploadChunk(dirs)),
          A.sequence(SRTE.Applicative),
        )
      }),
    )

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

const uploadChunk = (
  pathToDriwesid: Record<string, string>,
) =>
  (
    chunk: NEA<readonly [string, { path: string; stats: Stats }]>,
  ): XXX<DF.State, API.UploadMethodDeps, NEA<UploadResult>> =>
    state =>
      pipe(
        chunk,
        NA.map(([remotepath, element]) =>
          pipe(
            API.upload<DF.State>({
              sourceFilePath: element.path,
              docwsid: parseDrivewsid(pathToDriwesid[Path.dirname(remotepath)]).docwsid,
              zone: parseDrivewsid(pathToDriwesid[Path.dirname(remotepath)]).zone,
            })(state),
            RTE.chainFirstIOK(() => printerIO.print(`${remotepath}`)),
          )
        ),
        NA.sequence(RTE.ApplicativePar),
        RTE.map(
          results => [NA.unzip(results)[0], NA.last(results)[1]],
        ),
      )

const createDirStructure = (
  dstitemDrivewsid: string,
  dirstruct: string[],
): XXX<DF.State, Dep<'createFolders'>, Record<string, string>> => {
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
          SRTE.chainFirst(() => SRTE.fromIO(printerIO.print(`creating ${names} in ${parent}`))),
          SRTE.chain((dirToIdMap) =>
            API.createFoldersFailing<DF.State>({
              destinationDrivewsId: dirToIdMap[parent],
              names,
            })
          ),
          SRTE.map(flow(
            A.zip(names),
            A.reduce(dirToIdMap, (a, [item, name]) =>
              R.upsertAt(
                Path.join(parent, name),
                item.drivewsid as string,
              )(a)),
          )),
        ),
    ),
  )
}

const parseDrivewsid = (drivewsid: string) => {
  const [type, zone, docwsid] = drivewsid.split('::')
  return { type, zone, docwsid }
}
