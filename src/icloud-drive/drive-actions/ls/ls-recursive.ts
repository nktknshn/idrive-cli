import * as NA from "fp-ts/lib/NonEmptyArray";

import { NEA } from "../../../util/types";
import { DriveLookup } from "../..";

/** List paths recursively. Globs are supported */
export const listRecursive = ({ globs, depth, trash }: {
  globs: NA.NonEmptyArray<string>;
  depth: number;
  trash: boolean;
}): DriveLookup.Lookup<NEA<DriveLookup.SearchGlobFoundItem[]>> => {
  return DriveLookup.searchGlobs(globs, depth, { goDeeper: true, trash });
};
