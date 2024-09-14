import { flow } from "fp-ts/lib/function";
import * as SRTE from "fp-ts/lib/StateReaderTaskEither";
import * as Actions from "../../../icloud-drive/drive-actions";

export const recover = flow(
  Actions.recover,
  SRTE.map(_ => `${_.items.length} items were recovered.\n`),
);
