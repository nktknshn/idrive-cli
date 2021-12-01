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
import { CacheEntity, CacheEntityAppLibrary, CacheEntityFolderLike } from './cache/types'
import { DriveApi } from './drive-api'
import { fileName, parsePath, splitParent } from './helpers'
import { getUrlStream } from './requests/download'
import {
  Details,
  DetailsFolder,
  DetailsRoot,
  DriveChildrenItem,
  DriveChildrenItemFile,
  DriveChildrenItemFolder,
  DriveFolderLike,
  isDetails,
  isFile,
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
