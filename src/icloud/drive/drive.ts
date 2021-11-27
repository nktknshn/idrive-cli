import * as A from 'fp-ts/lib/Array'
import * as E from 'fp-ts/lib/Either'
import { constVoid, flow, hole, Lazy, pipe } from 'fp-ts/lib/function'
import * as O from 'fp-ts/lib/Option'
import { Predicate } from 'fp-ts/lib/Predicate'
import { snd } from 'fp-ts/lib/ReadonlyTuple'
import * as TE from 'fp-ts/lib/TaskEither'
import { fst } from 'fp-ts/lib/Tuple'
import { get } from 'spectacles-ts'
import { Readable } from 'stream'
import { err } from '../../lib/errors'
import { cacheLogger, logReturn, logReturnAs } from '../../lib/logging'
import { Cache } from './cache/Cache'
import { isFolderLikeCacheEntity, isFolderLikeType, isRootCacheEntity } from './cache/cachef'
import { CacheEntityAppLibrary, CacheEntityFolderLike, ICloudDriveCacheEntity } from './cache/types'
import { DriveApi } from './drive-api'
import { fileName, parsePath, splitParent } from './helpers'
import { getUrlStream } from './requests/download'
import {
  DriveChildrenItem,
  DriveChildrenItemFile,
  DriveChildrenItemFolder,
  DriveDetails,
  DriveDetailsFolder,
  DriveDetailsRoot,
  DriveFolderLike,
  isFile,
  isFolderDetails,
  isFolderLike,
  isFolderLikeItem,
  isRootDetails,
  partitionFoldersFiles,
  RecursiveFolder,
} from './types'
import { WasFolderChanged } from './update'

const predicate = <B>(pred: boolean, onFalse: Lazy<B>, onTrue: Lazy<B>) => {
  if (pred) {
    return onTrue()
  }

  return onFalse()
}
