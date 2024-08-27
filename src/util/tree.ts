import * as A from 'fp-ts/lib/Array'
import { pipe } from 'fp-ts/lib/function'
import * as O from 'fp-ts/lib/Option'
import { Predicate } from 'fp-ts/lib/Predicate'
import * as TR from 'fp-ts/lib/Tree'

/** `Some` if either the value or any of the forest items match the predicate */
export const filterTree = <T>(predicate: Predicate<T>) =>
  (tree: TR.Tree<T>): O.Option<TR.Tree<T>> => {
    const forestopts = pipe(
      tree.forest,
      A.map(filterTree(predicate)),
      A.filter(O.isSome),
      A.map(_ => _.value),
    )

    if (predicate(tree.value) || forestopts.length > 0) {
      return O.some(TR.make(tree.value, forestopts))
    }

    return O.none
  }
