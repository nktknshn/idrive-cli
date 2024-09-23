import { Eq } from "fp-ts/Eq";
import * as A from "fp-ts/lib/Array";
import { flow, pipe } from "fp-ts/lib/function";
import { snd } from "fp-ts/lib/ReadonlyTuple";
import * as R from "fp-ts/lib/Record";
import * as SRTE from "fp-ts/lib/StateReaderTaskEither";

import { printerIO } from "../../../logging/printerIO";
import { err } from "../../../util/errors";
import { guardSndRO } from "../../../util/guards";
import { Path } from "../../../util/path";
import { NEA, SRA } from "../../../util/types";
import { DriveLookup } from "../..";
import { DepApiMethod, DriveApiMethods } from "../../drive-api";

/** Creates a folder structure in the destination folder and returns a record of the drivewsid for each path */
export const createRemoteDirStructure = (
  dstFolderDrivewsid: string,
  dirstruct: string[],
): SRA<DriveLookup.State, DepApiMethod<"createFolders">, Record<string, string>> => {
  const task = getDirStructTask(dirstruct);

  const pathToDrivewsid: Record<string, string> = {
    "/": dstFolderDrivewsid,
  };

  return pipe(
    task,
    A.reduce(
      SRTE.of(pathToDrivewsid),
      (acc, [parent, subdirs]) =>
        pipe(
          acc,
          SRTE.chainFirstIOK(() => printerIO.print(`creating ${subdirs} in ${parent}`)),
          SRTE.chain(acc =>
            pipe(
              R.lookup(parent)(acc),
              SRTE.fromOption(() => err(`pathToDrivewsid missing ${parent}`)),
              SRTE.chain(destinationDrivewsId =>
                DriveApiMethods.createFoldersStrict<DriveLookup.State>({
                  destinationDrivewsId,
                  names: subdirs,
                })
              ),
              SRTE.map(flow(
                A.zip(subdirs),
                A.reduce(acc, (a, [item, name]) =>
                  R.upsertAt(
                    Path.join(parent, name),
                    item.drivewsid as string,
                  )(a)),
              )),
            )
          ),
        ),
    ),
  );
};

/*

expect(
      getDirStructTask(
        [
          "/a",
          "/a/b",
          "/a/c",
          "/a/b/d",
          "/a/b/e",
          "/a/b/e/f",
          "/a/b/e/g",
        ],
      ),
    ).toStrictEqual(
      [
        ["/", ["a"]],
        ["/a", ["b", "c"]],
        ["/a/b", ["d", "e"]],
        ["/a/b/e", ["f", "g"]],
      ],
    );

*/

/** Takes a list of paths and returns a list of pairs: [path, [subfoldersNames...]] */
export const getDirStructTask = (
  dirstruct: string[],
): (readonly [string, NEA<string>])[] => {
  return pipe(
    getSubdirsPerParent("/")(dirstruct),
    group<readonly [path: string, subfolderName: string]>({
      equals: ([p1], [p2]) => p1 == p2,
    }),
    A.map(parentKid => [parentKid[0][0], A.map(snd)(parentKid)] as const),
    A.filter(guardSndRO(A.isNonEmpty)),
  );
};

const group = <A>(S: Eq<A>): (as: Array<A>) => Array<Array<A>> => {
  return A.chop(as => {
    const { init, rest } = pipe(as, A.spanLeft((a: A) => S.equals(a, as[0])));
    return [init, rest];
  });
};

/*
const paths =[
  "/",
  "/z",
  "/a",
  "/a/b",
  "/a/c",
  "/a/b/d",
  "/a/b/e",
  "/a/b/e/f",
  "/a/b/e/g",
]

getSubdirsPerParent("/")(paths) =>
[
  ["/a", "b"],
  ["/a", "c"],
  ["/a/b", "d"],
  ["/a/b", "e"],
  ["/a/b/e", "f"],
  ["/a/b/e", "g"],
]
*/

/** Return a list of pairs: [path, subfolderName] */
export const getSubdirsPerParent = (parent: string) =>
(struct: string[]): (
  readonly [path: string, subfolderName: string]
)[] => {
  const kids = pipe(
    struct,
    A.map(Path.parse),
    A.filter(_ => _.dir == parent),
    A.map(_ => [parent, _.base] as const),
  );

  const subkids = pipe(
    kids,
    A.map(([parent, kid]) =>
      getSubdirsPerParent(
        Path.join(parent, kid),
      )(struct)
    ),
    A.flatten,
  );

  return [...kids, ...subkids];
};
