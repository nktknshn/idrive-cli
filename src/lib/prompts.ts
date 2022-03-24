import * as TE from 'fp-ts/lib/TaskEither'
import prompts_ from 'prompts'
import { err } from './errors'

export const prompts = TE.tryCatchK(prompts_, (e) => err(`error: ${e}`))

import { pipe } from 'fp-ts/lib/function'

export const askConfirmation = ({ message }: { message: string }) =>
  pipe(
    prompts({
      type: 'confirm',
      name: 'value',
      message,
    }, {
      onCancel: () => process.exit(1),
    }),
    TE.map(_ => {
      return _.value as boolean
    }),
  )
