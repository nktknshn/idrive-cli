import { sys } from "typescript"
import { logger } from "./logging"

function assert(value: unknown, message?: string | Error): asserts value {
    if (!value) {
        if (typeof message === 'string') {
            throw new MyError(message)
        }
        else {
            throw message
        }
    }
}


class MyError extends Error {

}

const command = (ass: typeof assert) => <R>(f: (ass: typeof assert) => (...args: any[]) => Promise<R>) => async (...args: unknown[]) => {
    try {
        return await f(ass)(...args)
    }
    catch (e) {
        if (e instanceof MyError) {
            logger.error(`error executing command: ${e.message}`)
            sys.exit(1)
        }
        else {
            throw e
        }
    }
}

export type Assert = typeof assert
export const asserting = command(assert)
