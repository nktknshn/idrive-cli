import { getApplySemigroup } from 'fp-ts/lib/Apply'
import * as A from 'fp-ts/lib/Array'
import * as E from 'fp-ts/lib/Either'
import { pipe } from 'fp-ts/lib/function'
import * as S from 'fp-ts/lib/Semigroup'

const eithers = [
  E.right(1),
  E.right(2),
  E.right(3),
  E.right(4),
]

// const s = getApplySemigroup<string, number[]>(A.getSemigroup<number>())

pipe(
  eithers,
)
