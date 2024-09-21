import * as A from "fp-ts/lib/Array";
import { identity, pipe } from "fp-ts/lib/function";
import * as NA from "fp-ts/lib/NonEmptyArray";
import * as Ord from "fp-ts/lib/Ord";
import { not } from "fp-ts/lib/Refinement";
import * as SRTE from "fp-ts/lib/StateReaderTaskEither";
import * as O from "fp-ts/Option";
import { DriveActions, DriveLookup, DriveTree, Types } from "../../../icloud-drive";
import { ListPathResult } from "../../../icloud-drive/drive-actions/ls/ls-shallow";
import { ListRecursiveTreeResult } from "../../../icloud-drive/drive-actions/ls/ls-tree";
import { ordDriveChildrenItemBySize } from "../../../icloud-drive/drive-types";
import { guardProp } from "../../../util/guards";
import { addLeadingSlash } from "../../../util/normalize-path";
import { Path } from "../../../util/path";
import { ensureSingleNewline } from "../../../util/string";
import { NEA } from "../../../util/types";
import * as LsPrinting from "./ls-printing/printing";

type Args = {
  paths: string[];
  "full-path": boolean;
  long: number;
  info: boolean;
  "human-readable": boolean;
  trash: boolean;
  tree: boolean;
  recursive: boolean;
  depth: number;
  sort: LsPrinting.Sort | undefined;
  json: boolean;
};

const defaultSort = "name";

export const ls = (
  args: Args,
): DriveLookup.Lookup<string> => {
  if (!A.isNonEmpty(args.paths)) {
    return DriveLookup.errString("no paths");
  }

  args.paths = pipe(args.paths, A.map(addLeadingSlash));

  if (args.recursive && args.tree) {
    return lsRecursiveTree(args);
  }

  if (args.recursive) {
    return lsRecursive(args);
  }

  return lsShallow(args);
};

// TODO show other dates for files
/** List a folder with zero depth */
const lsShallow = (
  args: Args,
): DriveLookup.Lookup<string> => {
  const paths = args.paths;

  if (!A.isNonEmpty(paths)) {
    return DriveLookup.errString("no paths");
  }

  const opts = {
    info: args.info,
    long: args.long,
    fullPath: args["full-path"],
    humanReadable: args["human-readable"],
    sort: args.sort ?? defaultSort,
  };

  const showText = (a: NEA<ListPathResult>): string =>
    pipe(
      a,
      NA.map(a =>
        a.valid
          ? LsPrinting.showValidPath(a)({ ...args, ...opts })
          : LsPrinting.showInvalidPath(a.validation) + "\n"
      ),
      NA.zip(paths),
      res =>
        res.length > 1
          // if multiple paths, zip the results with the paths
          ? pipe(res, NA.map(([res, path]) => `${path}:\n${res}`))
          // just show the first item without the path
          : [res[0][0]],
      _ => _.join("\n"),
      ensureSingleNewline,
    );

  const showJson = (a: NEA<ListPathResult>): string =>
    pipe(
      a,
      a => JSON.stringify(a),
    );

  return pipe(
    DriveActions.listShallow({ paths, trash: args.trash }),
    SRTE.map(args.json ? showJson : showText),
  );
};

const lsRecursive = (
  args: Args,
): DriveLookup.Lookup<string> => {
  if (!A.isNonEmpty(args.paths)) {
    return DriveLookup.errString("no paths");
  }

  const paths = args.paths;

  const opts = {
    info: args.info,
    long: args.long,
    humanReadable: args["human-readable"],
    fullPath: true,
    sort: args.sort ?? defaultSort,
  };

  const showText = (a: NEA<DriveLookup.SearchGlobFoundItem[]>): string =>
    pipe(
      a,
      NA.zip(paths),
      NA.map(([found, path]) => {
        const result: string[] = [];
        // exclude roots from the results
        const items = pipe(
          found,
          A.filter(guardProp("item", not(Types.isCloudDocsRootDetailsG))),
          A.filter(guardProp("item", not(Types.isTrashDetailsG))),
        );

        const driveItems = items.map(_ => _.item);

        const sw = LsPrinting.sizeWidth(driveItems, opts.humanReadable);
        const tw = LsPrinting.typeWidth(driveItems);
        const fw = items.map(_ => _.path.length).reduce((a, b) => Math.max(a, b), 0);

        const sortedItems = pipe(
          items,
          opts.sort === "size"
            ? A.sortBy([
              Ord.contramap((a: { item: Types.DriveChildrenItem }) => a.item)(ordDriveChildrenItemBySize),
            ])
            : identity,
        );

        for (const { item, path } of sortedItems) {
          result.push(
            LsPrinting.showItem(
              item,
              Path.dirname(path),
              { filenameWidth: fw, typeWidth: tw, sizeWidth: sw },
              opts,
            ),
          );
        }

        return `${path}:\n` + result.join("\n");
      }),
      _ => _.join("\n\n"),
      ensureSingleNewline,
    );

  const showJson = (a: NEA<DriveLookup.SearchGlobFoundItem[]>): string =>
    pipe(
      a,
      a => JSON.stringify(a),
    );

  return pipe(
    DriveActions.listRecursive({
      globs: args.paths,
      depth: args.depth,
      trash: args.trash,
    }),
    SRTE.map(args.json ? showJson : showText),
  );
};

/** Output as tree */
const lsRecursiveTree = (
  args: Args,
): DriveLookup.Lookup<string> => {
  if (!A.isNonEmpty(args.paths)) {
    return DriveLookup.errString("no paths");
  }

  const paths = args.paths;

  const showText = (a: NEA<ListRecursiveTreeResult>): string =>
    pipe(
      a,
      NA.zip(paths),
      NA.map(([tree, path]) =>
        pipe(
          tree,
          O.fold(() => Path.dirname(path) + "/", DriveTree.showTreeWithItems),
          a => `${path}:\n${a}`,
        )
      ),
      _ => _.join("\n\n"),
      ensureSingleNewline,
    );

  const showJson = (a: NEA<ListRecursiveTreeResult>): string =>
    pipe(
      a,
      a => JSON.stringify(a),
    );

  return pipe(
    DriveActions.listRecursiveTree({
      globs: args.paths,
      depth: args.depth,
      trash: args.trash,
    }),
    SRTE.map(args.json ? showJson : showText),
  );
};
