import assert from 'assert'
import { sequenceS, sequenceT } from 'fp-ts/lib/Apply'
import { flow, pipe } from 'fp-ts/lib/function'
import * as R from 'fp-ts/lib/Record'
import * as SRTE from 'fp-ts/lib/StateReaderTaskEither'
import * as O from 'fp-ts/Option'
import * as TE from 'fp-ts/TaskEither'
import { vi, vitest } from 'vitest'
import { CatchFetchDeps, catchFetchErrorsSRTE } from '../icloud-core/icloud-request/catch-fetch-error'
import { cache } from '../icloud-drive/drive-lookup/cache/cache-io-types'
import * as SRTEUtil from '../util/srte-utils'
import { SRTEWrapper, wrapSRTE } from './srte-wrapper'
import { EmptyObject } from './types'

interface User {
  id: string
  name: string
}

interface UserRepo {
  getUser: (id: string) => TE.TaskEither<Error, User | undefined>
}

const userRepo = (users: User[]): UserRepo => {
  const userMap: Record<string, User> = {}
  for (const u of users) {
    userMap[u.id] = u
  }
  return {
    getUser: (id) => pipe(R.lookup(id, userMap), O.toUndefined, TE.right),
  }
}

type State = { cache: Record<string, User | undefined> }
type Deps = { repo: UserRepo }

type UserRepoCached<S extends State, T> = SRTE.StateReaderTaskEither<S, Deps, Error, T>

const getUserCached = <S extends State>(id: string): UserRepoCached<S, User | undefined> => {
  return pipe(
    SRTEUtil.adoS({
      state: SRTE.get<S, Deps>(),
      deps: SRTE.ask(),
    }),
    SRTE.chainTaskEitherK(({ state: { cache }, deps }) =>
      pipe(
        R.lookup(id, cache),
        O.fold(() => deps.repo.getUser(id), TE.right),
      )
    ),
    SRTE.chainFirst(user => SRTE.modify(s => ({ ...s, cache: R.upsertAt(id, user)(s.cache) }))),
  )
}

const run = <S extends State, T>(m: UserRepoCached<S, T>) => m({ cache: {} } as S)({ repo })()

const repo = userRepo([
  { id: 'user1', name: 'Jack' },
  { id: 'user2', name: 'John' },
])

describe('srte wrapper', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  test('cached client', async () => {
    const spy = vitest.spyOn(repo, 'getUser')

    const reqs = [
      getUserCached('user1'),
      getUserCached('user2'),
      getUserCached('user1'),
      getUserCached('user2'),
    ] as const

    const res = await run(SRTEUtil.adoT(...reqs))

    assert(res._tag === 'Right')

    const [[u1, u2, u11], s] = res.right

    expect(Object.keys(s).length).toBe(2)

    expect(u1?.id).toBe('user1')
    expect(u2?.id).toBe('user2')
    expect(u11?.id).toBe('user1')

    expect(spy).toHaveBeenCalledTimes(2)

    expect(true).toBe(true)
  })

  const error = new Error('dead')

  test('fail', async () => {
    vi.spyOn(repo, 'getUser').mockImplementationOnce(() => TE.left(error))

    assert((await run(getUserCached('user1')))._tag === 'Left')
    assert((await run(getUserCached('user1')))._tag === 'Right')
  })
})

// test('wrapper', async () => {
//   const retryWrapper: SRTEWrapper<RetryDeps & CatchFetchDeps, State> = deps =>
//     flow(
//       retryDeadError(deps),
//       catchFetchErrorsSRTE(deps),
//     )

//   const getUserCachedWithRetry = wrapSRTE(retryWrapper)(getUserCached)

//   pipe(
//     getUserCached('user1'),
//     retryDeadError({ retry: 3 }),
//   )
// })

type RetryDeps = { retry: number }

const retryDeadError = (deps: RetryDeps) =>
  <S, R, E extends Error, A>(ma: SRTE.StateReaderTaskEither<S, R, E, A>): SRTE.StateReaderTaskEither<S, R, E, A> =>
    pipe(
      ma,
      SRTEUtil.orElse(e =>
        e.message === 'dead' && deps.retry > 0
          ? retryDeadError({ retry: deps.retry - 1 })(ma)
          : SRTE.left(e)
      ),
    )
