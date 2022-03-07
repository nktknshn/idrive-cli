import { Eq } from 'fp-ts/Eq'
import * as A from 'fp-ts/lib/Array'
import { flow, pipe } from 'fp-ts/lib/function'
import * as RTE from 'fp-ts/lib/ReaderTaskEither'
import { snd } from 'fp-ts/lib/ReadonlyTuple'
import * as SRTE from 'fp-ts/lib/StateReaderTaskEither'
import * as TE from 'fp-ts/lib/TaskEither'
import * as TR from 'fp-ts/lib/Tree'
import micromatch from 'micromatch'
import { Use } from '../../../icloud/drive/api/type'
import * as V from '../../../icloud/drive/cache/cache-get-by-path-types'
import * as DF from '../../../icloud/drive/drive'
import { DetailsDocwsRoot, isFolderLike } from '../../../icloud/drive/requests/types/types'
import { err } from '../../../lib/errors'
import { printerIO } from '../../../lib/logging'
import { XXX } from '../../../lib/types'
import { Path } from '../../../lib/util'
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
    SRTE.bindW('exclude', () => SRTE.of(exclude)),
    SRTE.bindW('dry', () => SRTE.of(dry)),
    SRTE.bindW('include', () => SRTE.of(include)),
    SRTE.chainW(handle),
    SRTE.map((res) => `Success. ${JSON.stringify(res)}`),
  )
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

const getSubdirsPerParent = (parent: string) =>
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
) => {
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
    SRTE.ask<DF.State, Deps, Error>(),
    SRTE.chain((api) =>
      pipe(
        task,
        A.reduce(
          SRTE.of(dirToIdMap),
          (acc, [parent, names]) =>
            pipe(
              acc,
              SRTE.chainW((dirToIdMap) =>
                pipe(
                  api.createFoldersM<DF.State>({
                    destinationDrivewsId: dirToIdMap[parent],
                    names,
                  }),
                  SRTE.chainFirstIOK(() => printerIO.print(`${names} in ${parent}`)),
                  SRTE.map(_ => A.zip(names)(_.folders)),
                  SRTE.map(
                    A.reduce(
                      dirToIdMap,
                      (a, [item, name]) => ({ ...a, [Path.join(parent, name)]: item.drivewsid }),
                    ),
                  ),
                )
              ),
            ),
        ),
      )
    ),
  )
}
const parseDrivewsid = (drivewsid: string) => {
  const [type, zone, docwsid] = drivewsid.split('::')
  return { type, zone, docwsid }
}
const handle = (
  { src, dst, api, include, exclude, dry }: {
    src: string
    dst: V.GetByPathResult<DetailsDocwsRoot>
    api: Deps
    dry: boolean
    include: string[]
    exclude: string[]
  },
): XXX<DF.State, Deps, unknown> => {
  const dirname = Path.parse(src).base
  const task = pipe(
    walkDirRel(src),
    TE.map(createUploadTask({ include, exclude })),
  )

  if (dst.valid) {
    const dstitem = V.target(dst)
    if (isFolderLike(dstitem)) {
      return pipe(
        DF.Do,
        SRTE.bindW('task', () => SRTE.fromTaskEither(task)),
        // SRTE.chainFirstIOK(({ task }) => printerIO.print(task.uploadable)),
        dry
          ? SRTE.map(() => '')
          : flow(
            SRTE.bindW('uploadRoot', () =>
              api.createFoldersM({
                names: [dirname],
                destinationDrivewsId: dstitem.drivewsid,
              })),
            SRTE.bindW(
              'dirs',
              ({ uploadRoot, task }) =>
                pipe(
                  printerIO.print(`creating dir structure`),
                  SRTE.fromIO,
                  SRTE.chain(() => createDirStructure(uploadRoot.folders[0].drivewsid, task.dirstruct)),
                ),
            ),
            SRTE.chainW(({ task, dirs }) => {
              return pipe(
                task.uploadable,
                A.chunksOf(5),
                A.map((chunk) =>
                  pipe(
                    SRTE.get<DF.State, DF.DriveMEnv>(),
                    SRTE.chainW((s) =>
                      SRTE.fromReaderTaskEither(pipe(
                        chunk,
                        A.map(([remotepath, element]) =>
                          pipe(
                            api.upload<DF.State>({
                              sourceFilePath: Path.join(src, element.path),
                              docwsid: parseDrivewsid(dirs[Path.dirname(remotepath)]).docwsid,
                              zone: parseDrivewsid(dirs[Path.dirname(remotepath)]).zone,
                            })(s),
                            RTE.chainFirstIOK(() => printerIO.print(`${remotepath}`)),
                          )
                        ),
                        A.sequence(RTE.ApplicativePar),
                      ))
                    ),
                  )
                ),
                SRTE.sequenceArray,
              )
            }),
            SRTE.map(() => ''),
          ),
        SRTE.map(() => ''),
      )
    }
  }

  return SRTE.left(err(`invalid location`))
}
