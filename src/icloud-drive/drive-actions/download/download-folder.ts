import * as A from "fp-ts/lib/Array";
import * as E from "fp-ts/lib/Either";
import { flow, pipe } from "fp-ts/lib/function";
import * as RTE from "fp-ts/lib/ReaderTaskEither";
import { fst } from "fp-ts/lib/ReadonlyTuple";
import * as SRTE from "fp-ts/lib/StateReaderTaskEither";
import { DepFs } from "../../../deps-types";
import { printerIO } from "../../../logging/printerIO";
import { guardFst } from "../../../util/guards";
import { normalizePath } from "../../../util/path";
import { DriveLookup, DriveTree, Types } from "../..";
import { of } from "../../drive-lookup";
import { applySoultions, ConflictsSolver, Solution } from "./conflict-solution";
import { Conflict, lookForLocalConflicts } from "./download-conflict";
import { createEmpties, createLocalDirStruct } from "./download-local";
import { DownloadFileResult, DownloadICloudFilesFunc, DownloadItem, DownloadTask, DownloadTaskMapped } from "./types";

/*
Download a file or a folder content.

`idrive download '/Obsidian/my1/note1.md' ./outputdir`
`idrive download -S '/Obsidian/my1/note1.md' ./outputdir`
`idrive download /Obsidian/my1/note1.md /Obsidian/my1/note2.md ./outputdir`
`idrive download -S /Obsidian/my1/note1.md /Obsidian/my1/note2.md ./outputdir`
`idrive download '/Obsidian/my1/*.md' ./outputdir`

Recursively download into `./outputdir/my1/`
`idrive download -R '/Obsidian/my1/' ./outputdir`

Recursively download all `md` files into `./outputdir/diary/`
`idrive download -R '/Obsidian/my1/diary/**\/*.md' ./outputdir`

Download download all into `./outputdir/Obsidian/my1/diary/`
`idrive download -RS '/Obsidian/my1/diary/**\/*.md' ./outputdir`

Use `dry` flag to only check what is going to be downloaded
` include` and `exclude` flags are also supported
*/

export type Deps =
  & DriveLookup.Deps
  & DepFs<
    | "fstat"
    | "mkdir"
    | "writeFile"
  >;

type Args = {
  path: string;
  dry: boolean;
  // include: string[]
  // exclude: string[]
  depth: number;
};

type DownloadFolderOpts<TSolverDeps, TDownloadDeps> = Args & {
  /** filters the tree picking files to download */
  treefilter: <T extends Types.Root>(
    flatTree: DriveTree.FlattenWithItems<T>,
  ) => DownloadTask & { excluded: DownloadItem[] };
  /** decides where to download the files to */
  toLocalFileSystemMapper: (ds: DownloadTask) => DownloadTaskMapped;
  /** provides strategy to resolve conflicts and errors. Like overwrite, skip, etc. */
  conflictsSolver: ConflictsSolver<TSolverDeps>;
  /** downloads files from the cloud */
  downloadFiles: DownloadICloudFilesFunc<TDownloadDeps>;
};

type DownloadFolderInfo = {
  args: Args;
  folderTree: DriveTree.FlattenWithItems<Types.DetailsDocwsRoot | Types.NonRootDetails>;
  downloadTask: DownloadTask & { excluded: DownloadItem[] };
  mappedTask: DownloadTaskMapped;
  conflicts: Conflict[];
  solutions: Solution[];
  solvedTask: DownloadTaskMapped;
};

/** Prepares the local filesystem creating directories and empty files */
const prepareLocalFs = (task: DownloadTaskMapped) =>
  pipe(
    SRTE.fromReaderTaskEither<DepFs<"mkdir" | "writeFile">, Error, void, DriveLookup.State>(
      pipe(
        createLocalDirStruct(task.localdirstruct),
        RTE.chainW(() => createEmpties(task)),
      ),
    ),
  );

export const executeDownloadTask = <TDownloadDeps>(
  { downloader }: { downloader: DownloadICloudFilesFunc<TDownloadDeps> },
) =>
  (task: DownloadTaskMapped) =>
    pipe(
      prepareLocalFs(task),
      SRTE.chainW(() => downloader(task)),
    );

/** Download a folder */
export const downloadFolder = <TSolverDeps, TDownloadDeps>(
  {
    path,
    depth,
    dry = false,

    treefilter,
    toLocalFileSystemMapper,
    conflictsSolver,
    downloadFiles,
  }: DownloadFolderOpts<TSolverDeps, TDownloadDeps>,
): DriveLookup.Lookup<string, Deps & TSolverDeps & TDownloadDeps> => {
  const verbose = dry;

  const downloadFolderTask = pipe(
    of({ args: { path, dry, depth } }),
    // get the flattened tree
    SRTE.bind("folderTree", () => DriveLookup.getFolderTreeByPathFlattenDocwsroot(normalizePath(path), depth)),
    // filter the tree
    SRTE.bindW("downloadTask", ({ folderTree }) => DriveLookup.of(treefilter(folderTree))),
    // assign a local path to each file
    SRTE.bindW("mappedTask", ({ downloadTask }) =>
      pipe(
        DriveLookup.of(toLocalFileSystemMapper(downloadTask)),
      )),
    // check for conflicts
    SRTE.bindW("conflicts", ({ mappedTask }) =>
      SRTE.fromReaderTaskEither(pipe(
        mappedTask,
        RTE.fromReaderTaskK(lookForLocalConflicts),
      ))),
    // ask for conflict resolution
    SRTE.bindW("solutions", ({ conflicts }) =>
      SRTE.fromReaderTaskEither(pipe(
        conflicts,
        A.matchW(() => RTE.of([]), conflictsSolver),
      ))),
    // resolve conflicts
    SRTE.bindW("solvedTask", ({ mappedTask, solutions }) =>
      pipe(
        DriveLookup.of(
          applySoultions(mappedTask)(solutions),
        ),
      )),
  );

  return pipe(
    downloadFolderTask,
    SRTE.chainFirstIOK(flow(
      showVerbose({ verbose }),
      printerIO.print,
    )),
    SRTE.map(({ solvedTask }) => solvedTask),
    dry
      ? SRTE.map(() => [])
      : SRTE.chainW(executeDownloadTask({
        downloader: downloadFiles,
      })),
    SRTE.map(resultsJson),
    SRTE.map(JSON.stringify),
  );
};

const showVerbose = ({ verbose = false }) =>
  ({ mappedTask, solvedTask }: DownloadFolderInfo) => {
    return showTask({ verbose })({
      ...solvedTask,
      initialTask: mappedTask,
    });
  };

const showTask = ({ verbose = false }) =>
  (task: DownloadTaskMapped & { initialTask: DownloadTaskMapped }) =>
    task.downloadable.length > 0
      ? verbose
        ? `will be downloaded: \n${
          [...task.downloadable, ...task.empties].map(({ item: info, localpath }) => `${info.path} into ${localpath}`)
            .join(
              "\n",
            )
        }\n\n`
          + `local dirs: ${task.localdirstruct.join("\n")}`
        : `${task.downloadable.length + task.empties.length} files will be downloaded`
      : `nothing to download. ${task.initialTask.downloadable.length} files were skipped by conflict solver`;

const resultsJson = (results: DownloadFileResult[]) => {
  return {
    success: results.filter(flow(fst, E.isRight)).length,
    fail: results.filter(flow(fst, E.isLeft)).length,
    fails: pipe(
      results,
      A.filter(guardFst(E.isLeft)),
      A.map(([err, [_url, path]]) => `${path}: ${err.left}`),
    ),
  };
};
