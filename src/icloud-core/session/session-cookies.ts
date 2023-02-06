import { SessionCookies } from './session-type'

import * as A from 'fp-ts/lib/Array'
import { identity, pipe } from 'fp-ts/lib/function'
import * as O from 'fp-ts/lib/Option'
import * as R from 'fp-ts/lib/Record'
import { splitPair } from '../../util/util'

const parse = (webauthTokenCookie: string): string | undefined =>
  pipe(
    webauthTokenCookie
      .replace(/^"/, '')
      .replace(/"$/, '')
      .split(':'),
    A.map(_ => splitPair('=', _)),
    A.filterMap(identity),
    _ => _ as [string, string][],
    R.fromFoldable(
      { concat: (a: string, b: string) => b },
      A.Foldable,
    ),
    a => a['t'],
  )

export const readWebauthToken = (cookies: SessionCookies) => {
  return pipe(
    cookies,
    R.lookup('X-APPLE-WEBAUTH-TOKEN'),
    O.map(_ => parse(_.value)),
    O.fold(() => ({ t: undefined }), t => ({ t })),
  )
}
