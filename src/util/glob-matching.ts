import micromatch from 'micromatch'

// somehow micromatch behaviour:
// micromatch.isMatch('/a', '/**/*') === false
// micromatch.isMatch('/a', '**/*') === true
// but
// micromatch.isMatch('/a/b', '/a/**/*') === true

// it seems micromatch doesn't like leading slashes
// so we remove them

/** Returns true if the path matches the glob */
export const isMatching = (path: string, glob: string, options?: micromatch.Options): boolean => {
  return micromatch.isMatch(
    path === '/' ? '/' : path.replace(/^\//, ''),
    glob.replace(/^\//, ''),
    options,
  )
}
