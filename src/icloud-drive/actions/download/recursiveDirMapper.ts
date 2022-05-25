import { identity } from 'fp-ts/lib/function'
import { Path, prependPath } from '../../../util/path'
import { DownloadTask, DownloadTaskMapped } from './types'

export const recursiveDirMapper = (
  dstpath: string,
  mapPath: (path: string) => string = identity,
) =>
  (ds: DownloadTask): DownloadTaskMapped => {
    return {
      downloadable: ds.downloadable
        .map((item) => ({
          remoteitem: item,
          localpath: prependPath(dstpath)(mapPath(item.remotepath)),
        })),
      empties: ds.empties
        .map((item) => ({
          remoteitem: item,
          localpath: prependPath(dstpath)(mapPath(item.remotepath)),
        })),
      localdirstruct: [
        dstpath,
        ...ds.dirstruct
          .map(p => prependPath(dstpath)(mapPath(p))),
      ],
    }
  }

export const shallowDirMapper = (dstpath: string) =>
  (ds: DownloadTask) => ({
    downloadable: ds.downloadable.map(remoteitem => ({
      remoteitem,
      localpath: Path.join(dstpath, Path.basename(remoteitem.remotepath)),
    })),
    empties: ds.empties.map(remoteitem => ({
      remoteitem,
      localpath: Path.join(dstpath, Path.basename(remoteitem.remotepath)),
    })),
    localdirstruct: [dstpath],
  })
