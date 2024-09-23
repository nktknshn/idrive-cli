import * as E from "fp-ts/lib/Either";
import { pipe } from "fp-ts/lib/function";
import * as RTE from "fp-ts/lib/ReaderTaskEither";
import * as TE from "fp-ts/lib/TaskEither";
import * as TR from "fp-ts/lib/Tree";
import { DepFs } from "../../deps-types/dep-fs";
import { LocalTreeItem } from "../localtree";
import * as LT from "./../localtree";
import { stripTrailingSlash } from "./../normalize-path";
import { Path } from "./../path";

export const walkDir = (path: string): RTE.ReaderTaskEither<
  DepFs<"fstat" | "opendir">,
  Error,
  TR.Tree<LocalTreeItem>
> =>
  RTE.asksReaderTaskEitherW(({ fs }: DepFs<"fstat" | "opendir">) =>
    pipe(
      fs.opendir(path),
      TE.chain(dir =>
        TE.fromTask(
          async () => {
            const items: TR.Forest<LocalTreeItem> = [];

            for await (const dirent of dir) {
              const itemPath = Path.join(
                dir.path,
                dirent.name,
              );

              const stats = await fs.fstat(itemPath)();

              if (E.isLeft(stats)) {
                throw stats.left;
              }

              if (dirent.isFile()) {
                items.push(TR.make(
                  {
                    type: "file",
                    path: itemPath,
                    name: dirent.name,
                    stats: stats.right,
                  },
                ));
              } else if (dirent.isDirectory()) {
                const dirTree = await walkDir(itemPath)({ fs })();

                if (E.isLeft(dirTree)) {
                  throw dirTree.left;
                }

                items.push(dirTree.right);
              }
            }

            const stats = await fs.fstat(dir.path)();
            if (E.isLeft(stats)) {
              throw stats.left;
            }

            return TR.make(
              {
                type: "directory" as const,
                path: dir.path + "/",
                name: Path.basename(dir.path),
                stats: stats.right,
              },
              items,
            );
          },
        )
      ),
      RTE.fromTaskEither,
    )
  );

/** Walk a directory and return a tree of local items. Paths are relative to the destination path */
export const walkDirRelative = (
  dstpath: string,
): RTE.ReaderTaskEither<DepFs<"fstat" | "opendir">, Error, LT.LocalTree> => {
  const np = stripTrailingSlash(Path.normalize(dstpath));

  return pipe(
    walkDir(np),
    RTE.map(
      TR.map(
        treeItem => ({
          ...treeItem,
          path: treeItem.path.substring(
            np.length,
          ),
        }),
      ),
    ),
  );
};

export const showLocalTreeElement = (el: LocalTreeItem) => `${el.type} {path: ${el.path}, name: ${el.name}}`;
