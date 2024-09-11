import { pipe } from 'fp-ts/lib/function'
import * as TE from 'fp-ts/TaskEither'
import { DriveLookup } from '../../../../src/icloud-drive'
import * as M from '.'

type CallsPartial = Partial<ReturnType<M.Calls['calls']>>

type ReqTestCase<T> = {
  req: DriveLookup.Lookup<T>
  test: (req: DriveLookup.Lookup<T>) => void
}

type ResultMatcherF = (res: any) => void
type CallsMatcherF = (calls: ReturnType<M.Calls['calls']>) => void
type StateMatcherF = (state: DriveLookup.State) => void

type TestMatcher<T> = {
  calls: CallsMatcherF
  res: ResultMatcherF
  state: StateMatcherF
}

export const allTests = (...tests: Array<TE.TaskEither<Error, M.ExecuteResult<any>>>) =>
  Promise.all(tests.map(f => f()))

export const testStateTE = (f: (exp: jest.JestMatchers<any>) => void) =>
  <T>(req: TE.TaskEither<Error, M.ExecuteResult<T>>) =>
    pipe(
      req,
      TE.map((a) => {
        f(expect(a.state))
        return a
      }),
      testNoError,
    )

export const testCacheTE = (f: (exp: DriveLookup.Cache) => void) =>
  (req: TE.TaskEither<Error, M.ExecuteResult<any>>) =>
    pipe(
      req,
      TE.map((a) => {
        f(a.state.cache)
        return a
      }),
      testNoError,
    )

export const testCallsTE = (toMatch: CallsPartial) =>
  <T>(req: TE.TaskEither<Error, M.ExecuteResult<T>>) =>
    pipe(
      req,
      TE.map((a) => {
        expect(a.calls()).toMatchObject(toMatch)
        return a
      }),
      testNoError,
    )

export const testErrorIs = (isError: (e: Error) => boolean) =>
  (req: TE.TaskEither<Error, M.ExecuteResult<any>>) =>
    pipe(
      req,
      testError,
      TE.mapLeft((a) => {
        expect(isError(a)).toBe(true)
        return a
      }),
    )

export const testError = (req: TE.TaskEither<Error, M.ExecuteResult<any>>) =>
  pipe(
    req,
    TE.map((a) => {
      throw new Error(`Expected error during test.`)
    }),
  )

export const testNoError = <T>(req: TE.TaskEither<Error, M.ExecuteResult<T>>) =>
  pipe(
    req,
    TE.mapLeft((a) => {
      throw new Error(`Expected no error during test, but got: ${a}`)
    }),
  )

export const testResTE = <T>(f: (res: T) => void) =>
  (req: TE.TaskEither<Error, M.ExecuteResult<T>>) =>
    pipe(
      req,
      TE.map((a) => {
        f(a.res)
        return a
      }),
      testNoError,
    )

export const testExpectResTE = (f: (exp: jest.JestMatchers<any>) => void) =>
  (req: TE.TaskEither<Error, M.ExecuteResult<any>>) =>
    pipe(
      req,
      TE.map((a) => {
        f(expect(a.res))
        return a
      }),
      testNoError,
    )

const testCalls = (toMatch: Partial<ReturnType<M.Calls['calls']>>): CallsMatcherF =>
  (calls: ReturnType<M.Calls['calls']>) => {
    expect(calls).toMatchObject(toMatch)
  }

const testRes = (f: (exp: jest.JestMatchers<any>) => void): ResultMatcherF => (res) => f(expect(res))

const createTest = <T>(
  tm: Partial<TestMatcher<T>>,
): (req: TE.TaskEither<Error, M.ExecuteResult<T>>) => void => {
  return req => {
    return pipe(
      req,
      TE.map(({ calls, res, state }) => {
        if (tm.calls !== undefined) {
          tm.calls(calls())
        }
        if (tm.res !== undefined) {
          tm.res(res)
        }
        if (tm.state !== undefined) {
          tm.state(state)
        }
        return res
      }),
    )
  }
}
