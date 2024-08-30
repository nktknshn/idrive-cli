import { Eq } from 'fp-ts/Eq'
import * as A from 'fp-ts/lib/Array'
import { flow, pipe } from 'fp-ts/lib/function'
import * as RTE from 'fp-ts/lib/ReaderTaskEither'
import { fst, snd } from 'fp-ts/lib/ReadonlyTuple'
import * as R from 'fp-ts/lib/Record'
import * as SRTE from 'fp-ts/lib/StateReaderTaskEither'
import * as TR from 'fp-ts/lib/Tree'
import * as NA from 'fp-ts/NonEmptyArray'
import micromatch from 'micromatch'
import { printerIO } from '../../../logging/printerIO'
import { err } from '../../../util/errors'
import { FsStats } from '../../../util/fs'
import { getDirectoryStructure } from '../../../util/get-directory-structure'
import { guardSndRO } from '../../../util/guards'
import { LocalTreeElement } from '../../../util/localtreeelement'
import { Path } from '../../../util/path'
import { NEA, SRA } from '../../../util/types'
import { DriveLookup } from '../..'
import { DepApiMethod, DriveApiMethods } from '../../drive-api'
import { parseDrivewsid } from '../../util/drive-helpers'

export type UploadResult = {
  status: { status_code: number; error_message: string }
  etag: string
  zone: string
  type: string
  document_id: string
  parent_id: string
  mtime: number
}

export type UploadTask = {
  dirstruct: string[]
  uploadable: (readonly [string, { path: string; stats: FsStats }])[]
  empties: (readonly [string, { path: string; stats: FsStats }])[]
  excluded: (readonly [string, { path: string; stats: FsStats }])[]
}

export const getUploadTask = (
  { exclude, include }: { include: string[]; exclude: string[] },
) =>
  (reltree: TR.Tree<LocalTreeElement>): UploadTask => {
    const flatTree = pipe(
      reltree,
      TR.reduce([] as (readonly [string, LocalTreeElement])[], (acc, cur) => [...acc, [cur.path, cur] as const]),
    )

    const files = pipe(
      flatTree,
      A.filter(flow(snd, _ => _.type === 'file')),
    )

    const { left: excluded, right: valid } = pipe(
      files,
      A.partition(
        ([path, _item]) =>
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

export const uploadChunkPar = (
  pathToDrivewsid: Record<string, string>,
) =>
  (
    chunk: NEA<
      readonly [
        remotepath: string,
        local: { path: string; stats: FsStats },
      ]
    >,
  ): SRA<DriveLookup.State, DepApiMethod<'upload'>, NEA<UploadResult>> =>
    state =>
      pipe(
        chunk,
        NA.map(([remotepath, local]) => {
          const d = parseDrivewsid(pathToDrivewsid[Path.dirname(remotepath)])
          return pipe(
            DriveApiMethods.upload<DriveLookup.State>({
              sourceFilePath: local.path,
              docwsid: d.docwsid,
              zone: d.zone,
            })(state),
            RTE.chainFirstIOK(() => printerIO.print(`${remotepath}`)),
          )
        }),
        NA.sequence(RTE.ApplicativePar),
        RTE.map(
          results => [NA.unzip(results)[0], NA.last(results)[1]],
        ),
      )

export const getDirStructTask = (
  dirstruct: string[],
) => {
  return pipe(
    getSubdirsPerParent('/')(dirstruct),
    group<readonly [parent: string, kid: string]>({
      equals: ([p1], [p2]) => p1 == p2,
    }),
    A.map(parentKid => [parentKid[0][0], A.map(snd)(parentKid)] as const),
    A.filter(guardSndRO(A.isNonEmpty)),
  )
}

export const createRemoteDirStructure = (
  dstitemDrivewsid: string,
  dirstruct: string[],
): SRA<DriveLookup.State, DepApiMethod<'createFolders'>, Record<string, string>> => {
  const task = getDirStructTask(dirstruct)

  const pathToDrivewsid: Record<string, string> = {
    '/': dstitemDrivewsid,
  }

  return pipe(
    task,
    A.reduce(
      SRTE.of(pathToDrivewsid),
      (acc, [parent, subdirs]) =>
        pipe(
          acc,
          SRTE.chainFirstIOK(() => printerIO.print(`creating ${subdirs} in ${parent}`)),
          SRTE.chain(acc =>
            pipe(
              R.lookup(parent)(acc),
              SRTE.fromOption(() => err(`pathToDrivewsid missing ${parent}`)),
              SRTE.chain(destinationDrivewsId =>
                DriveApiMethods.createFoldersStrict<DriveLookup.State>({
                  destinationDrivewsId,
                  names: subdirs,
                })
              ),
              SRTE.map(flow(
                A.zip(subdirs),
                A.reduce(acc, (a, [item, name]) =>
                  R.upsertAt(
                    Path.join(parent, name),
                    item.drivewsid as string,
                  )(a)),
              )),
            )
          ),
        ),
    ),
  )
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

export const showUploadTask = ({ dirstruct, empties, excluded, uploadable }: UploadTask) =>
  `excluded:\n${excluded.map(fst).join('\n').length} items\n\nempties:\n${
    empties.map(fst).join('\n')
  }\n\nuploadable:\n${
    uploadable.map(fst).join('\n')
    + `\n\ndirstruct: `
    + `${dirstruct.join('\n')}`
    + `\n\n`
    + getDirStructTask(dirstruct)
      .map(([parent, kids]) => `${parent}: ${kids}`)
      .join('\n')
  }`
