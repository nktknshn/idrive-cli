import micromatch from "micromatch";
import { DriveLookup } from "../../../icloud-drive";
import { DriveActions } from "../../../icloud-drive";

type Args = {
  path: string;
  dstpath: string;
  dry: boolean;
  recursive: boolean;
  overwrite: boolean;
  include: string[];
  exclude: string[];
  "keep-structure": boolean;
  "chunk-size": number;
};

export const download = (args: Args): DriveLookup.Lookup<string, DriveActions.DownloadRecursiveDeps> => {
  const scan = micromatch.scan(args.path);

  if (scan.isGlob) {
    args.include = [scan.input, ...args.include];
    args.path = scan.base;
  }

  if (args.recursive) {
    return DriveActions.downloadRecursive({
      ...args,
      chunkSize: args["chunk-size"],
      keepStructure: args["keep-structure"],
    });
  } else {
    return DriveActions.downloadShallow({
      ...args,
      chunkSize: args["chunk-size"],
    });
  }
};
