import { sequenceS } from 'fp-ts/lib/Apply'
import { pipe } from 'fp-ts/lib/function'
import * as RTE from 'fp-ts/lib/ReaderTaskEither'
import * as SRTE from 'fp-ts/lib/StateReaderTaskEither'
import { ApiRequest, BaseState, RequestDeps } from './types'

/**
Module for building and executing low level APIi Request and decoding server response
*/

export const { chain, fromEither, fromOption, fromTaskEither, get, left, map, of, filterOrElse } = SRTE

const ado = sequenceS(SRTE.Apply)

export const readStateAndDeps = <
  S extends BaseState,
  R extends RequestDeps = RequestDeps,
>(): SRTE.StateReaderTaskEither<
  S,
  R,
  Error,
  { state: S; deps: R }
> => ado({ state: SRTE.get<S, R, Error>(), deps: SRTE.ask<S, R, Error>() })

export const orElse = <R, S extends BaseState>(
  onError: (e: Error) => ApiRequest<R, S>,
) =>
  (
    ma: ApiRequest<R, S>,
  ): ApiRequest<R, S> => {
    return (s: S) =>
      pipe(
        ma(s),
        RTE.orElse(e => onError(e)(s)),
      )
  }
