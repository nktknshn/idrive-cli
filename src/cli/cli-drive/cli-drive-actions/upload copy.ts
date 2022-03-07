// import { constVoid, pipe } from 'fp-ts/lib/function'
// import * as NA from 'fp-ts/lib/NonEmptyArray'
// import * as RTE from 'fp-ts/lib/ReaderTaskEither'
// import * as SRTE from 'fp-ts/lib/StateReaderTaskEither'
// import { defaultApiEnv } from '../../../defaults'
// import { AuthorizedState } from '../../../icloud/authorization/authorize'
// import * as V from '../../../icloud/drive/cache/cache-get-by-path-types'
// import * as DF from '../../../icloud/drive/drive copy'
// import * as H from '../../../icloud/drive/drive/validation'
// import { parseName } from '../../../icloud/drive/helpers'
// import * as RQ from '../../../icloud/drive/requests'
// import * as AR from '../../../icloud/drive/requests/request'
// import { DetailsDocwsRoot, fileName, isFolderLike } from '../../../icloud/drive/requests/types/types'
// import { rootDrivewsid } from '../../../icloud/drive/requests/types/types-io'
// import { err } from '../../../lib/errors'
// import { Path } from '../../../lib/util'
// import { cliActionM2, loadAccountData, loadCache, loadSessionFile } from '../../cli-action'
// import { normalizePath } from './helpers'

// interface Api<F extends URIS> {
//   uploadSimple: ({ sourceFilePath, docwsid, fname, zone }: {
//     zone: string
//     sourceFilePath: string
//     docwsid: string
//     fname?: string | undefined
//   }) => Kind<F, {
//     status: { status_code: number; error_message: string }
//     etag: string
//     zone: string
//     type: string
//     document_id: string
//     parent_id: string
//     mtime: number
//   }>

//   renameItemsM: ({ items }: {
//     items: { drivewsid: string; etag: string; name: string; extension?: string }[]
//   }) => Kind<F, RQ.RenameResponse>

//   moveItemsToTrash: ({ items, trash }: {
//     items: { drivewsid: string; etag: string }[]
//     trash?: boolean | undefined
//   }) => Kind<F, RQ.MoveItemToTrashResponse>
// }

// type capUpload = {
//   uploadSimple: ({ sourceFilePath, docwsid, fname, zone }: {
//     zone: string
//     sourceFilePath: string
//     docwsid: string
//     fname?: string | undefined
//   }) => AR.ApiRequest<
//     {
//       status: {
//         status_code: number
//         error_message: string
//       }
//       etag: string
//       zone: string
//       type: string
//       document_id: string
//       parent_id: string
//       mtime: number
//     },
//     AuthorizedState,
//     AR.RequestEnv
//   >
// }

// type capRenameItems = {
//   renameItemsM: ({ items }: {
//     items: {
//       drivewsid: string
//       etag: string
//       name: string
//       extension?: string
//     }[]
//   }) => AR.AuthorizedRequest<RQ.RenameResponse, AuthorizedState>
// }

// type capMoveItemsToTrash = {
//   moveItemsToTrash: ({ items, trash }: {
//     items: {
//       drivewsid: string
//       etag: string
//     }[]
//     trash?: boolean | undefined
//   }) => AR.AuthorizedRequest<RQ.MoveItemToTrashResponse, AuthorizedState>
// }

// type ApiType =
//   & capMoveItemsToTrash
//   & capUpload
//   & capRenameItems

// import { Kind, URIS } from 'fp-ts/lib/HKT'
// import * as TE from 'fp-ts/TaskEither'
// import { State } from '../../../icloud/drive/drive'

// const uploadOverwrighting2 = (
//   { src, dst }: { dst: V.PathValidWithFile<H.Hierarchy<DetailsDocwsRoot>>; src: string },
// ) => {
//   const dstitem = V.target(dst)
//   const parent = NA.last(dst.path.details)

//   return pipe(
//     RTE.Do,
//     RTE.bindW('api', () => ({ api }: { api: ApiType }) => TE.of(api)),
//     RTE.bindW('session', () => loadSessionFile),
//     RTE.bindW('accountData', () => loadAccountData),
//     RTE.bindW('cache', () => loadCache),
//     RTE.chainW((env) =>
//       env.api.uploadSimple(
//         { sourceFilePath: src, docwsid: parent.docwsid, zone: dstitem.zone },
//       )(env)
//     ),
//   )
// }

// const Do = <S extends AuthorizedState>() => SRTE.of<S, unknown, Error, unknown>({})

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
//   pipe(
//     pipe(
//       DF.Do,
//       SRTE.bindW('root', () => DF.chainRoot(root => DF.of(root))),
//       SRTE.bindW('src', () => SRTE.of(srcpath)),
//       SRTE.bindW('overwright', () => SRTE.of(overwright)),
//       SRTE.bindW('dst', ({ root }) => DF.lsPartial(root, normalizePath(dstpath))),
//       SRTE.chainW(handle),
//       SRTE.map(() => `Success. ${Path.basename(srcpath)}`),
//     ),
//   )
// }

// const getDrivewsid = ({ zone, document_id, type }: { document_id: string; zone: string; type: string }) => {
//   return `${type}::${zone}::${document_id}`
// }

// const uploadOverwrighting = (
//   { src, dst }: { dst: V.PathValidWithFile<H.Hierarchy<DetailsDocwsRoot>>; src: string },
// ) => {
//   const dstitem = V.target(dst)
//   const parent = NA.last(dst.path.details)

//   return pipe(
//     Do(),
//     SRTE.bindW(
//       'api',
//       () =>
//         SRTE.fromReaderTaskEither(
//           RTE.asks((api: capUpload & capMoveItemsToTrash & capRenameItems) => api),
//         ),
//     ),
//     SRTE.bindW(
//       'uploadResult',
//       ({ api }) => api.uploadSimple({ sourceFilePath: src, docwsid: parent.docwsid, zone: dstitem.zone }),
//     ),
//     SRTE.bindW('removeResult', ({ api }) => {
//       return api.moveItemsToTrash({
//         items: [dstitem],
//         trash: true,
//       })
//     }),
//     SRTE.chainW(({ uploadResult, removeResult, api }) => {
//       const drivewsid = getDrivewsid(uploadResult)
//       return pipe(
//         api.renameItemsM({
//           items: [{
//             drivewsid,
//             etag: uploadResult.etag,
//             ...parseName(fileName(dstitem)),
//           }],
//         }),
//       )
//     }),
//   )
// }

// const handle = (
//   { src, dst, overwright }: { dst: V.GetByPathResult<DetailsDocwsRoot>; src: string; overwright: boolean },
// ) =>
//   SRTE.fromReaderTaskEither<capUpload, Error, unknown, State>(
//     RTE.asks((api: capUpload) => {
//       // if the target path is presented on icloud drive
//       if (dst.valid) {
//         const dstitem = V.target(dst)

//         // if it's a folder
//         if (isFolderLike(dstitem)) {
//           return pipe(
//             api.uploadSimple({ sourceFilePath: src, docwsid: dstitem.docwsid, zone: dstitem.zone }),
//           )
//         }
//         // if it's a file and the overwright flag set
//         else if (overwright && V.isValidWithFile(dst)) {
//           return uploadOverwrighting({ src, dst })
//         }
//         // otherwise we cancel uploading
//         else {
//           return DF.errS(`invalid destination path: ${V.asString(dst)} It's a file`)
//         }
//       }

//       // if the path is valid only in its parent folder
//       if (dst.path.rest.length == 1) {
//         // upload and rename
//         const dstitem = NA.last(dst.path.details)
//         const fname = NA.head(dst.path.rest)

//         if (isFolderLike(dstitem)) {
//           return pipe(
//             api.uploadSimple({ sourceFilePath: src, docwsid: dstitem.docwsid, fname, zone: dstitem.zone }),
//           )
//         }
//       }

//       return DF.errS(`invalid destination path: ${H.showMaybeValidPath(dst.path)}`)
//     }),
//   )
