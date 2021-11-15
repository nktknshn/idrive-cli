import { getApplySemigroup } from 'fp-ts/lib/Apply'
import * as A from 'fp-ts/lib/Array'
import * as E from 'fp-ts/lib/Either'
import { pipe } from 'fp-ts/lib/function'
import * as S from 'fp-ts/lib/Semigroup'

const a = ['fdf', 'sab', 'asasasasascd', 'dd', 'asasda', 'ff', 'd']

const res = pipe(
  a,
  A.partitionMapWithIndex((idx, v) => v.length > 3 ? E.left([idx, v] as const) : E.right([idx, v] as const)),
)

console.log(
  res,
)
