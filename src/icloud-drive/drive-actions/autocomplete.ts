import { pipe } from "fp-ts/lib/function";
import * as SRTE from "fp-ts/lib/StateReaderTaskEither";
import { normalizePath, Path } from "../../util/path";
import { DriveLookup, Types } from "..";
import { fileName, fileNameAddSlash } from "../drive-types";

export const autocomplete = ({ path, trash, file, dir }: {
  path?: string;
  trash: boolean;
  file: boolean;
  dir: boolean;
}): DriveLookup.Lookup<string> => {
  if (path === undefined) {
    path = "/";
  }
  const npath = normalizePath(path);
  const nparentPath = normalizePath(Path.dirname(path));

  const childName = Path.basename(path);
  const lookupDir = path.endsWith("/");

  const targetDir = lookupDir ? npath : nparentPath;

  const getPath: DriveLookup.Lookup<Types.Details> = trash
    ? DriveLookup.getByPathFolderStrictTrash(targetDir)
    : DriveLookup.getByPathFolderStrictDocwsroot(targetDir);

  return pipe(
    pipe(
      getPath,
      SRTE.map(parent =>
        lookupDir
          ? parent.items
          : parent.items.filter(
            f => fileName(f).startsWith(childName),
          )
      ),
      SRTE.map((result) =>
        result
          .filter(item => file ? item.type === "FILE" : true)
          .filter(item => dir ? item.type === "FOLDER" || item.type === "APP_LIBRARY" : true)
          .map(fileNameAddSlash)
          .map(fn => lookupDir ? `/${npath}/${fn}` : `/${nparentPath}/${fn}`)
          .map(Path.normalize)
          .join("\n")
      ),
    ),
  );
};
