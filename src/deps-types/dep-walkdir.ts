import * as TE from 'fp-ts/lib/TaskEither'
import * as TR from 'fp-ts/lib/Tree'
import { LocalTreeElement } from '../util/localtreeelement'

export type DepWalkDir = {
  walkdir: (path: string) => TE.TaskEither<
    Error,
    TR.Tree<LocalTreeElement>
  >
}
