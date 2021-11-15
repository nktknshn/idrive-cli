import * as E from 'fp-ts/lib/Either'
import { constVoid, pipe } from 'fp-ts/lib/function'
import * as T from 'fp-ts/lib/Task'
import * as TE from 'fp-ts/lib/TaskEither'
import * as rl from 'readline'
import { BufferDecodingError, err } from './errors'
import { tryDecodeBuffer } from './files'

const write: (a: string | Uint8Array) => TE.TaskEither<Error, unknown> = TE.taskify(
  process.stdout.write.bind(process.stdout),
)
const read: (size?: number | undefined) => TE.TaskEither<Error, unknown> = TE.taskify((size?: number | undefined) =>
  process.stdin.read(size)
)

const readSingleLine: T.Task<string> = () => {
  return new Promise<string>((resolve, reject) => {
    const iface = rl.createInterface(process.stdin).on('line', (line) => {
      iface.close()
      resolve(line)
    })
  })
}

const readTask = TE.tryCatch(readSingleLine, (e) => err(String(e)))

const decodeBytes = (
  bytes: unknown,
): E.Either<BufferDecodingError | Error, string> =>
  pipe(
    bytes instanceof Buffer
      ? tryDecodeBuffer(bytes)
      : typeof bytes === 'string'
      ? E.of(bytes)
      : E.throwError(err(`wrong input`)),
  )

export function input({
  prompt,
}: {
  prompt?: string
}): TE.TaskEither<BufferDecodingError | Error, string> {
  return pipe(
    TE.of(prompt),
    TE.chain((prompt) => (prompt ? write(prompt) : TE.of(constVoid()))),
    TE.chain(() => readTask),
    TE.chainW(TE.fromEitherK(decodeBytes)),
    TE.map((_) => _.trim()),
  )
}

// function dec2bin(dec: number) {
//     return Number(dec).toString(2);
// }

// async function main() {

//     // // const n = '\xfe'

//     // // console.log(
//     // //     n
//     // // );

//     // // console.log(
//     // //     dec2bin(n)
//     // // );

//     // const res = await input({
//     //     prompt: 'code: '
//     // })()

//     console.log(
//         new TextDecoder('utf8', { fatal: true }).decode(
//             new Uint8Array([254, 254, 255, 255])
//         )
//     );

//     // const res = new TextDecoder().decode(
//     //     new Uint8Array([254, 254, 255, 255])
//     // )

//     // console.log(
//     //     res
//     // );

//     // console.log(
//     //     new TextEncoder().encode(res)
//     // );

// }

// main()
