import micromatch from "micromatch";

// somehow micromatch behaviour:
// micromatch.isMatch('/a', '/**/*') === false
// micromatch.isMatch('/a', '**/*') === true
// but
// micromatch.isMatch('/a/b', '/a/**/*') === true

// it seems micromatch doesn't like leading slashes
// so we remove them

/** Returns true if the path matches the glob. Leading slash from `path` is removed unless it is `/`. Leading slash is also removed from `glob` */
export const isMatching = (path: string, glob: string, options?: micromatch.Options): boolean => {
  return micromatch.isMatch(
    path === "/" ? "/" : path.replace(/^\//, ""),
    glob.replace(/^\//, ""),
    options,
  );
};

export const isMatchingAny = (path: string, globs: string[], options?: micromatch.Options): boolean =>
  globs.some(glob => isMatching(path, glob, options));

export const isGlobstar = (glob: string): boolean => glob.indexOf("**") > 0;

export const includesGlobstar = (globs: string[]): boolean => globs.some(isGlobstar);
