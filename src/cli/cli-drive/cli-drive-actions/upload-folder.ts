// import { constVoid, pipe } from 'fp-ts/lib/function'
// import * as NA from 'fp-ts/lib/NonEmptyArray'
// import * as SRTE from 'fp-ts/lib/StateReaderTaskEither'
// import { defaultApiEnv } from '../../../defaults'
// import * as API from '../../../icloud/drive/api'
// import * as V from '../../../icloud/drive/cache/cache-get-by-path-types'
// import * as DF from '../../../icloud/drive/drive'
// import * as H from '../../../icloud/drive/drive/validation'
// import { parseName } from '../../../icloud/drive/helpers'
// import { DetailsDocwsRoot, fileName, isFolderLike } from '../../../icloud/drive/requests/types/types'
// import { Path } from '../../../lib/util'
// import { cliActionM2 } from '../../cli-action'
// import { normalizePath } from './helpers'

// import fs from 'fs/promises'
// import { ESRTE } from '../../../icloud/drive/drive/m2'

// // fs.opendir

// export const uploadFolder = (
//   { sessionFile, cacheFile, srcpath, dstpath, noCache, overwright }: {
//     srcpath: string
//     dstpath: string
//     noCache: boolean
//     sessionFile: string
//     cacheFile: string
//     overwright: boolean
//   },
// ) => {
//   return pipe(
//     { sessionFile, cacheFile, noCache, ...defaultApiEnv },
//     cliActionM2(() => {
//       return pipe(
//         DF.Do,
//         SRTE.bind('root', () => DF.chainRoot(DF.of)),
//         SRTE.bind('src', () => DF.of(srcpath)),
//         SRTE.bind('overwright', () => DF.of(overwright)),
//         SRTE.bind('dst', ({ root }) => DF.getByPathH(root, normalizePath(dstpath))),
//         DF.chain(handle),
//         DF.map(() => `Success. ${Path.basename(srcpath)}`),
//       )
//     }),
//   )
// }

// export const upload = (
//   { sessionFile, cacheFile, srcpath, dstpath, noCache, overwright }: {
//     srcpath: string
//     dstpath: string
//     noCache: boolean
//     sessionFile: string
//     cacheFile: string
//     overwright: boolean
//   },
// ) => {
//   return pipe(
//     { sessionFile, cacheFile, noCache, ...defaultApiEnv },
//     cliActionM2(() => {
//       return pipe(
//         DF.Do,
//         SRTE.bind('root', () => DF.chainRoot(DF.of)),
//         SRTE.bind('src', () => DF.of(srcpath)),
//         SRTE.bind('overwright', () => DF.of(overwright)),
//         SRTE.bind('dst', ({ root }) => DF.getByPathH(root, normalizePath(dstpath))),
//         DF.chain(handle),
//         DF.map(() => `Success. ${Path.basename(srcpath)}`),
//       )
//     }),
//   )
// }

// const handle = (
//   { src, dst, overwright }: { dst: V.GetByPathResult<DetailsDocwsRoot>; src: string; overwright: boolean },
// ): DF.DriveM<void> => {
//   // if the target path is presented on icloud drive
//   if (dst.valid) {
//     const dstitem = V.target(dst)

//     // if it's a folder
//     if (isFolderLike(dstitem)) {
//       return pipe(
//         API.upload<DF.DriveMState>({ sourceFilePath: src, docwsid: dstitem.docwsid, zone: dstitem.zone }),
//         DF.map(constVoid),
//       )
//     }
//     // if it's a file and the overwright flag set
//     else if (overwright && V.isValidWithFile(dst)) {
//       return uploadOverwrighting({ src, dst })
//     }
//     // otherwise we cancel uploading
//     else {
//       return DF.errS(`invalid destination path: ${V.asString(dst)} It's a file`)
//     }
//   }

//   // if the path is valid only in its parent folder
//   if (dst.path.rest.length == 1) {
//     // upload and rename
//     const dstitem = NA.last(dst.path.details)
//     const fname = NA.head(dst.path.rest)

//     if (isFolderLike(dstitem)) {
//       return pipe(
//         API.upload<DF.DriveMState>({ sourceFilePath: src, docwsid: dstitem.docwsid, fname, zone: dstitem.zone }),
//         DF.map(constVoid),
//       )
//     }
//   }

//   return DF.errS(`invalid destination path: ${H.showMaybeValidPath(dst.path)}`)
// }

// const getDrivewsid = ({ zone, document_id, type }: { document_id: string; zone: string; type: string }) => {
//   return `${type}::${zone}::${document_id}`
// }

// const uploadOverwrighting = (
//   { src, dst }: { dst: V.PathValidWithFile<H.Hierarchy<DetailsDocwsRoot>>; src: string },
// ): DF.DriveM<
//   void
// > => {
//   const dstitem = V.target(dst)
//   const parent = NA.last(dst.path.details)

//   return pipe(
//     DF.Do,
//     SRTE.bind(
//       'uploadResult',
//       () => (API.upload<DF.DriveMState>({ sourceFilePath: src, docwsid: parent.docwsid, zone: dstitem.zone })),
//     ),
//     SRTE.bind('removeResult', () => {
//       return (API.moveItemsToTrash({
//         items: [dstitem],
//         trash: true,
//       }))
//     }),
//     DF.chain(({ uploadResult, removeResult }) => {
//       const drivewsid = getDrivewsid(uploadResult)
//       return pipe(
//         API.renameItems<DF.DriveMState>({
//           items: [{
//             drivewsid,
//             etag: uploadResult.etag,
//             ...parseName(fileName(dstitem)),
//           }],
//         }),
//         DF.map(constVoid),
//       )
//     }),
//   )
// }
