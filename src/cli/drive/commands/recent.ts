import { pipe } from "fp-ts/lib/function";
import * as SRTE from "fp-ts/lib/StateReaderTaskEither";
import { DriveActions, DriveLookup } from "idrive-lib";
import * as LS from "./ls-printing";

export const recent = () =>
  pipe(
    DriveActions.recentDocs<DriveLookup.State>({ limit: 50 }),
    SRTE.map(items => LS.showItems(items, "")),
  );
