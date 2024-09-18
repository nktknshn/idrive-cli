import * as A from "fp-ts/lib/Array";
import { pipe } from "fp-ts/lib/function";
import { Eq } from "fp-ts/lib/string";
import { Path, stripTrailingSlash } from "./path";

/** Returns a list of directories */
export const getDirectoryStructure = (
  paths: string[],
): string[] => {
  const parseDown = (path: string) => {
    const result = [];

    while (path !== "/" && path !== "") {
      result.push(path);
      path = Path.parse(path).dir;
    }

    return A.reverse(result);
  };

  return pipe(
    paths,
    A.map(Path.parse),
    A.zip(paths),
    A.map(([_, p]) => p.endsWith("/") ? stripTrailingSlash(p) : _.dir),
    A.map(parseDown),
    A.flatten,
    A.uniq<string>(Eq),
  );
};
