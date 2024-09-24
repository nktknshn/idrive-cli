import { flow } from "fp-ts/lib/function";
import * as SRTE from "fp-ts/lib/StateReaderTaskEither";
import { DriveActions } from "idrive-lib";

export const mkdir = flow(
  DriveActions.mkdir,
  SRTE.map(a => `Created ${a[0].name}`),
);
