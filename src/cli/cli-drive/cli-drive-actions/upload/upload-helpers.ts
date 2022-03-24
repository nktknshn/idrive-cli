import { Eq } from 'fp-ts/Eq'
import * as A from 'fp-ts/lib/Array'
import { flow, pipe } from 'fp-ts/lib/function'
import * as RTE from 'fp-ts/lib/ReaderTaskEither'
import { snd } from 'fp-ts/lib/ReadonlyTuple'
import * as R from 'fp-ts/lib/Record'
import * as SRTE from 'fp-ts/lib/StateReaderTaskEither'
import * as TR from 'fp-ts/lib/Tree'
import * as NA from 'fp-ts/NonEmptyArray'
import { Stats } from 'fs'
import micromatch from 'micromatch'
import * as API from '../../../../icloud/drive/deps/api-methods'
import { DepApi } from '../../../../icloud/drive/deps/deps'
import * as Drive from '../../../../icloud/drive/drive'
import { printerIO } from '../../../../lib/logging'
import { NEA, XXX } from '../../../../lib/types'
import { Path } from '../../../../lib/util'
import { getDirectoryStructure } from '../download/download-helpers'
import { LocalTreeElement } from '../download/walkdir'
import { parseDrivewsid } from '../helpers'
import { UploadResult } from '../upload-folder'

type UploadTask = {
  dirstruct: string[]
  uploadable: (readonly [string, { path: string; stats: Stats }])[]
  empties: (readonly [string, { path: string; stats: Stats }])[]
  excluded: (readonly [string, { path: string; stats: Stats }])[]
}

export const createUploadTask = (
  { exclude, include }: { include: string[]; exclude: string[] },
) =>
  (tree: TR.Tree<LocalTreeElement>): UploadTask => {
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

export const uploadChunk = (
  pathToDriwesid: Record<string, string>,
) =>
  (
    chunk: NEA<
      readonly [remotepath: string, element: { path: string; stats: Stats }]
    >,
  ): XXX<Drive.State, API.UploadMethodDeps, NEA<UploadResult>> =>
    state =>
      pipe(
        chunk,
        NA.map(([remotepath, element]) =>
          pipe(
            API.upload<Drive.State>({
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

export const createRemoteDirStructure = (
  dstitemDrivewsid: string,
  dirstruct: string[],
): XXX<Drive.State, DepApi<'createFolders'>, Record<string, string>> => {
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
            API.createFoldersFailing<Drive.State>({
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
