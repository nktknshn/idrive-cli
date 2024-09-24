import * as w from "yargs-command-wrapper";
import * as defaults from "../../defaults";

const SortChoices = ["name", "size", "date"] as const;

const init = w.command(
  "init",
  "Init new session",
  a => a.options({ "skip-login": { default: false, type: "boolean" } }),
);

const auth = w.command(
  "auth",
  "Authenticate a session",
  a => a.options({}),
);

// const LS_MAX_VERBOSITY = 2;

const ls = w.command("ls [paths..]", "List files in a folder", _ =>
  _
    .positional("paths", { type: "string", array: true, default: ["/"] })
    .options({
      "full-path": { alias: ["f"], default: false, type: "boolean", description: "Print full paths" },
      long: { alias: ["l"], default: false, description: "Use a long listing format" },
      recursive: { alias: ["R"], default: false, type: "boolean", description: "Recursive listing" },
      depth: { alias: ["D"], default: Infinity, type: "number", description: "Depth of recursive listing" },
      tree: { alias: ["T"], default: false, type: "boolean", description: "Print tree view" },
      info: { alias: ["i"], default: false, type: "boolean", description: "Include folder info in listing" },
      "human-readable": {
        alias: ["h"],
        default: false,
        type: "boolean",
        description: "With -l, print sizes like 1K 234M 2G etc.",
      },
      trash: { alias: ["t"], default: false, type: "boolean", description: "List trash" },
      // TODO date
      sort: {
        alias: ["S"],
        choices: SortChoices,
        default: "name",
        type: "string",
        description: "Sort by",
      },
      json: { alias: ["j"], default: false, type: "boolean", description: "Print as JSON" },
    })
    .coerce("sort", (a): typeof SortChoices[number] => {
      if (SortChoices.includes(a)) {
        return a;
      }

      throw new Error(`Invalid sort option: ${a}`);
    })
    .count("long")
    // TODO. it doesn't type check currently
    // .coerce("long", (a) => Math.min(a, LS_MAX_VERBOSITY))
    .check((args) => {
      if (args.depth < 0) {
        throw new Error("Depth must be positive");
      }

      if (args.tree && !args.recursive) {
        throw new Error("Tree view requires recursive listing");
      }

      return true;
    }));

const download = w.command(
  "download <paths..>",
  "Download a file or a folder",
  (_) =>
    _.positional("paths", { type: "string", demandOption: true, array: true })
      // .positional("dstpath", { type: "string", demandOption: true })
      .options({
        /** Dry run. Just prints the download task */
        dry: { default: false, type: "boolean" },
        include: { default: [], type: "string", array: true },
        exclude: { default: [], type: "string", array: true },
        recursive: { alias: ["R"], default: false, type: "boolean" },
        "full-path": {
          alias: ["F"],
          default: false,
          type: "boolean",
          description: "Create full paths locally",
        },
        "chunk-size": {
          default: defaults.downloadChunkSize,
          type: "number",
          description: "Chunk size",
        },
        "no-update-time": {
          alias: ["T"],
          default: false,
          type: "boolean",
          description: "Do not update atime and mtime of the files",
        },
        depth: { alias: ["D"], default: Infinity, type: "number", description: "Depth of recursiion" },
        verbose: { alias: ["v"], default: false, type: "boolean", description: "Verbose output" },
        // overwrite local files without asking
        overwrite: {
          alias: ["o", "f", "force"],
          default: false,
          type: "boolean",
          description: "Overwrite existing local files without asking",
        },
        // skip local files without asking
        skip: {
          alias: ["s"],
          default: false,
          type: "boolean",
          description: "Skip existing local files without asking",
        },
        "skip-size-date": {
          alias: ["S"],
          default: false,
          type: "boolean",
          description: "Skip files with the same size and date",
        },
        "no-confirmation": {
          alias: ["N"],
          default: false,
          type: "boolean",
          description: "Do not ask for the last confirmation",
        },
      }).check((args) => {
        const paths = args.paths;

        if (Array.isArray(paths) && paths.length < 2) {
          throw new Error("Missing destination path");
        }

        if (args.skip && args.overwrite) {
          throw new Error("Cannot use --skip and --overwrite at the same time");
        }

        return true;
      }),
);

const upload = w.command(
  "upload <paths..>",
  "Upload files and folders",
  (_) =>
    _.positional("paths", { type: "string", array: true, demandOption: true })
      .options({
        overwrite: { default: false, type: "boolean" },
        "skip-trash": { default: false, type: "boolean" },
        recursive: { alias: ["R"], default: false, type: "boolean" },

        include: { default: [], type: "string", array: true },
        exclude: { default: [], type: "string", array: true },
        dry: { default: false, type: "boolean" },
        // chunkSize: { default: 2, type: 'number', implies: ['recursive'] },
      })
      .check((args) => {
        const paths = args.paths;

        if (Array.isArray(paths) && paths.length < 2) {
          throw new Error("Missing destination path");
        }

        return true;
      }),
);

const mkdir = w.command(
  "mkdir <path>",
  "Create a folder",
  (_) => _.positional("path", { type: "string", demandOption: true }),
);

const rm = w.command(
  "rm [paths..]",
  "Remove files and folders",
  (_) =>
    _.positional("paths", { type: "string", array: true, demandOption: true })
      .options({
        "dry": { default: false, type: "boolean", description: "Dry run" },
        "skip-trash": { default: false, type: "boolean", description: "Skip trash" },
        force: { default: false, type: "boolean" },
        recursive: { alias: ["R"], default: false, type: "boolean" },
        trash: { alias: ["t"], default: false, type: "boolean", description: "Remove from trash" },
      }),
);

const cat = w.command(
  "cat <path>",
  "View the content of a text file",
  (_) =>
    _.positional("path", { type: "string", demandOption: true })
      .options({}),
);

const edit = w.command(
  "edit <path>",
  "Edit a text file",
  (_) =>
    _.positional("path", { type: "string", demandOption: true })
      .options({
        editor: { type: "string", default: defaults.fileEditor },
      }),
);

const mv = w.command(
  "mv <srcpath> <dstpath>",
  "Move or rename a file or a folder",
  (_) =>
    _.positional("srcpath", { type: "string", demandOption: true })
      .positional("dstpath", { type: "string", demandOption: true }),
);

const autocomplete = w.command(
  "autocomplete [path]",
  "Autocomplete path",
  (_) =>
    _.positional("path", { type: "string", demandOption: false })
      .options({
        file: { default: false, type: "boolean" },
        dir: { default: false, type: "boolean" },
        trash: { alias: ["t"], default: false, type: "boolean" },
        // cached: { default: false, type: "boolean" },
      }),
);

const recover = w.command(
  "recover <path>",
  "Recover a file from the trash",
  (_) => _.positional("path", { type: "string", demandOption: true }),
);

const apiUsage = ["onlycache", "fallback", "validate"] as const;
const apiUsageChoices = [...apiUsage, "o", "f", "v"];

export const cmd = w.composeCommands(
  _ =>
    _.version(defaults.cliVersion)
      .scriptName("idrive")
      .options({
        "session-file": {
          default: undefined,
          optional: true,
          description: "Session file",
        },
        "cache-file": {
          default: undefined,
          optional: true,
          description: "Cache file",
        },
        "no-cache": { default: false, type: "boolean", description: "Disable cache" },
        "api-usage": {
          alias: ["a"],
          default: defaults.apiUsage,
          type: "string",
          choices: apiUsageChoices,
          description: "API usage strategy",
          coerce: (a): typeof apiUsage[number] => {
            if (apiUsage.includes(a)) {
              return a;
            }

            switch (a) {
              case "o":
                return "onlycache";
              case "f":
                return "fallback";
              case "v":
                return "validate";
            }

            throw new Error(`Invalid api usage: ${a}`);
          },
        },
        debug: { alias: "d", default: false, type: "boolean" },
      }),
  init,
  auth,
  ls,
  mkdir,
  cat,
  edit,
  mv,
  rm,
  download,
  upload,
  recover,
  autocomplete,
);

export type CliCommands = w.GetCommandArgs<typeof cmd>;
