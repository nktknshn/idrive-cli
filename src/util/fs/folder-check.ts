import * as E from "fp-ts/Either";
import { pipe } from "fp-ts/lib/function";
import * as RTE from "fp-ts/lib/ReaderTaskEither";
import * as T from "fp-ts/Task";
import * as TE from "fp-ts/TaskEither";
import { DepFs } from "../../deps-types";
import { isEnoentError } from "./is-enoent-error";

type Deps = DepFs<"fstat">;

/** Returns false if the folder does not exist or the path is not a folder */
export const checkFolderExists = (path: string): RTE.ReaderTaskEither<Deps, Error, boolean> =>
  ({ fs }) =>
    pipe(
      fs.fstat(path),
      TE.chain((a) =>
        a.isDirectory()
          ? TE.right(true)
          : TE.right(false)
      ),
      TE.fold(e =>
        isEnoentError(e)
          ? T.of(E.right(false))
          : T.of(E.left(e)), TE.right),
    );
