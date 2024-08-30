import * as O from 'fp-ts/Option'

export const getEnv = (name: string): O.Option<string> => O.fromNullable(process.env[name])
