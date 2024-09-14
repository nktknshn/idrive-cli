import { constVoid, pipe } from "fp-ts/lib/function";
import * as RTE from "fp-ts/lib/ReaderTaskEither";
import * as TE from "fp-ts/TaskEither";
import { DepFs } from "../../deps-types/dep-fs";
import { FileInvalidError, FileNotFoundError } from "../errors";
import { FsError } from ".";
import { isEnoentError } from "./is-enoent-error";

type Deps = DepFs<"fstat">;

export class FileSizeError extends Error {
  readonly tag = "FileSizeError";
  constructor(public readonly message: string) {
    super(message);
  }

  static is(a: Error): a is FileSizeError {
    return a instanceof FileSizeError;
  }

  static create(path: string): FileSizeError {
    return new FileSizeError(path);
  }
}

export type AssetFileSizeError = FileNotFoundError | FileInvalidError | FileSizeError | FsError;

/** Checks if the file size is in the range [minimumSize, maximumSize]. Otherwise returns an error. */
export const assertFileSize = (
  { path, minimumSize, maximumSize = Infinity }: {
    path: string;
    minimumSize: number;
    maximumSize?: number;
  },
): RTE.ReaderTaskEither<Deps, AssetFileSizeError, void> =>
  ({ fs }) =>
    pipe(
      fs.fstat(path),
      TE.mapLeft(e => isEnoentError(e) ? FileNotFoundError.create(path) : e),
      TE.chainW((a) =>
        a.isFile()
          ? TE.right(a)
          : TE.left(FileInvalidError.create(path))
      ),
      TE.chainW(a =>
        a.size >= minimumSize && a.size <= maximumSize
          ? TE.right(constVoid())
          : TE.left(FileSizeError.create(`File size ${a.size} is not in range [${minimumSize}, ${maximumSize}].`))
      ),
    );
