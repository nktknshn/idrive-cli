import * as A from 'fp-ts/Array'
import * as O from 'fp-ts/lib/Option'
import * as TR from 'fp-ts/lib/Tree'

import { pipe } from 'fp-ts/lib/function'
import { Types } from '../..'
import { Cache } from '../..'
import { TypesIo } from '../../drive-types'

type CacheTreeValue = {
  readonly drivewsid: string
  readonly name: string
}

export const asTree = (cache: Cache.LookupCache, drivewsid: string): O.Option<TR.Tree<CacheTreeValue>> => {
  const itemO = Cache.getByIdO(drivewsid)(cache)

  if (O.isNone(itemO)) {
    return O.none
  }

  const entity = itemO.value
  const name = Types.fileName(entity.content)

  const forest = entity.content.items.map(item =>
    Types.isFolderLike(item)
      ? asTree(cache, item.drivewsid)
      : O.some(TR.make({ drivewsid: item.drivewsid, name: item.name }))
  )

  const value: CacheTreeValue = { drivewsid, name }

  return pipe(
    forest,
    A.filter(O.isSome),
    A.map(_ => _.value),
    forest => TR.make(value, forest),
    O.some,
  )
}

export const drawTree = (cache: Cache.LookupCache): string => {
  const treeO = asTree(cache, TypesIo.rootDrivewsid)

  if (O.isNone(treeO)) {
    return `Cache.drawTree: Missing root in ${Object.keys(cache.byDrivewsid)}`
  }

  return pipe(
    treeO.value,
    TR.map(_ => _.name),
    TR.drawTree,
  )
}
