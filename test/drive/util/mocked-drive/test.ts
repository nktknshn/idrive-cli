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

export const testCallsTE = (toMatch: CallsPartial) =>
  (req: TE.TaskEither<Error, M.ExecuteResult<any>>) =>
    pipe(
      req,
      TE.map((a) => {
        expect(a.calls()).toMatchObject(toMatch)
        return a
      }),
    )

export const testResTE = (f: (exp: jest.JestMatchers<any>) => void) =>
  (req: TE.TaskEither<Error, M.ExecuteResult<any>>) =>
    pipe(
      req,
      TE.map((a) => {
        f(expect(a.res))
        return a
      }),
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
