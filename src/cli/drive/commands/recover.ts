import { flow } from "fp-ts/lib/function";
import * as SRTE from "fp-ts/lib/StateReaderTaskEither";
import { DriveActions } from "idrive-lib";

export const recover = flow(
  DriveActions.recover,
  SRTE.map(_ => `${_.items.length} items were recovered.\n`),
);
