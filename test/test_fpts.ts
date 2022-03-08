import { getApplySemigroup } from 'fp-ts/lib/Apply'
import * as Apply from 'fp-ts/lib/Apply'
import * as A from 'fp-ts/lib/Array'
import * as E from 'fp-ts/lib/Either'
import { pipe } from 'fp-ts/lib/function'
import * as n from 'fp-ts/lib/number'
import * as RTE from 'fp-ts/lib/ReaderTaskEither'
import * as S from 'fp-ts/lib/Semigroup'
import * as SRTE from 'fp-ts/lib/StateReaderTaskEither'
import * as T from 'fp-ts/lib/Tuple'
import * as M from 'fp-ts/Monoid'
import Path from 'path'

async function main() {
  console.log(
    await pipe(
      [1, 2, 3, 4],
      SRTE.traverseArray(n => SRTE.of(n + 1)),
    )({})({})(),
  )

  // Apply.ap(SRTE.Apply, )
  Apply.sequenceT(SRTE.Apply)
  const ts = T.getApply(n.SemigroupSum)

  const a = [1, 2, 3]

  const sg = S.struct({
    a: n.SemigroupSum,
    b: n.SemigroupSum,
  })
}

main()
