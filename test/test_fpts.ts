import { getApplySemigroup } from 'fp-ts/lib/Apply'
import * as A from 'fp-ts/lib/Array'
import * as E from 'fp-ts/lib/Either'
import { pipe } from 'fp-ts/lib/function'
import * as S from 'fp-ts/lib/Semigroup'
import Path from 'path'

const paths = [
  '/file1.txt',
  '/dir1/file1.txt',
  '/dir1/dir3/file1.txt',
  '/dir2/dir3/dir5/asd.txt',
  '/dir2/dir4/abc.txt',
  '/dir3/dir1/xyz',
]

const parseDown = (path: string) => {
  const result = []

  while (path !== '/') {
    result.push(path)
    path = Path.parse(path).dir
  }

  return A.reverse(result)
}

const struct = pipe(
  paths,
  A.map(Path.parse),
  A.map(_ => _.dir),
  A.map(parseDown),
  A.flatten,
  A.uniq<string>({ equals: (a, b) => a == b }),
)

const getKids = (parent: string) =>
  (struct: string[]): (readonly [string, string])[] => {
    const kids = pipe(
      struct,
      A.map(Path.parse),
      A.filter(_ => _.dir == parent),
      A.map(_ => [parent, _.base] as const),
    )

    const subkids = pipe(
      kids,
      A.map(([p, k]) => getKids(Path.join(p, k))(struct)),
      A.flatten,
    )

    return [...kids, ...subkids]
  }

console.log(
  pipe(
    struct,
    getKids('/'),
  ),
)
