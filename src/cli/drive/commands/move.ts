import { pipe } from "fp-ts/lib/function";
import * as SRTE from "fp-ts/lib/StateReaderTaskEither";
import { DriveActions, DriveLookup } from "idrive-lib";

import { normalizePath } from "idrive-lib/util/path";

export const move = ({ srcpath, dstpath }: {
  srcpath: string;
  dstpath: string;
}): DriveLookup.Lookup<string, DriveActions.DepsMove> => {
  const nsrc = normalizePath(srcpath);
  const ndst = normalizePath(dstpath);

  return pipe(
    DriveActions.move({ srcpath: nsrc, dstpath: ndst }),
    SRTE.map((res) => {
      if (res.items[0].status === "OK") {
        return `Moved.\n`;
      }

      return `Failed to move: ${res.items[0].status}\n`;
    }),
  );
};
