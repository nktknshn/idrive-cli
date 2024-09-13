/* eslint-disable @typescript-eslint/no-unused-vars */
import * as A from "fp-ts/lib/Array";
import * as E from "fp-ts/lib/Either";
import { pipe } from "fp-ts/lib/function";
import * as NA from "fp-ts/lib/NonEmptyArray";
import * as O from "fp-ts/lib/Option";
import * as R from "fp-ts/lib/Record";
import * as SRTE from "fp-ts/lib/StateReaderTaskEither";
import { fst } from "fp-ts/lib/Tuple";

import { loggerIO } from "../../../../logging";
import { SrteUtils } from "../../../../util";
import { err } from "../../../../util/errors";
import { guardFst } from "../../../../util/guards";
import { NormalizedPath } from "../../../../util/normalize-path";
import { NEA } from "../../../../util/types";
import { recordFromTuples } from "../../../../util/util";
import { DriveLookup, Types } from "../../..";
import { equalsDrivewsId, findInParentFilename } from "../../../util/drive-helpers";
import { modifySubset } from "../../../util/drive-modify-subset";
import * as GetByPath from "../../../util/get-by-path-types";
import { ItemIsNotFileError, ItemIsNotFolderError, NotFoundError } from "../../errors";
import { mergeTempCache } from "../cache-temp-cache";

/** Given a root details and a list of paths, retrieves the actual items if they exist. */
export const getByPaths = <R extends Types.Root>(
  root: R,
  paths: NEA<NormalizedPath>,
): DriveLookup.Lookup<NEA<GetByPath.Result<R>>> =>
  pipe(
    loggerIO.debug(`getByPaths(${paths})`),
    SRTE.fromIO,
    // get what we have cached
    SRTE.chain(() => DriveLookup.getByPathsFromCache(root, paths)),
    SRTE.bindTo("cached"),
    SRTE.bindW("deps", DriveLookup.ask),
    SRTE.chain(({ cached, deps }) => {
      switch (deps.apiUsage) {
        case "validate":
          // validate the cached paths
          return getByPathsC(paths, cached);
        case "onlycache":
          return SRTE.of(cached);
        case "fallback":
          return GetByPath.containsInvalidPath(cached)
            ? pipe(
              getByPathsC(paths, cached),
              SrteUtils.runLogging(loggerIO.debug(`getByPaths(${paths}) fallback`)),
              SRTE.chain(res =>
                // if some paths were not found
                // rerun with apiUsage set to 'validate'
                // note: not optimal but easier to implement
                GetByPath.containsInvalidPath(res)
                  ? pipe(
                    // reset the temp cache if it was active. otherwise the method will return the same result
                    SRTE.modify(mergeTempCache),
                    SRTE.chain(() => getByPathsC(paths, res)),
                    SrteUtils.runLogging(loggerIO.debug(`getByPaths(${paths}) fallback 2`)),
                    SRTE.local((deps): DriveLookup.Deps => ({
                      ...deps,
                      apiUsage: "validate",
                    })),
                  )
                  : SRTE.of(res)
              ),
            )
            : SRTE.of(cached);
      }
    }),
  );

const getByPathsC = <R extends Types.Root>(
  paths: NEA<NormalizedPath>,
  cached: NEA<GetByPath.Result<R>>,
): DriveLookup.Lookup<NEA<GetByPath.Result<R>>> =>
  pipe(
    DriveLookup.of(cached),
    SRTE.chainFirstIOK(() => loggerIO.debug(`getByPathsC(${paths})`)),
    SRTE.chainFirstIOK(
      (cached) => loggerIO.debug(`cached: ${cached.map(GetByPath.showGetByPathResult).join("\n")}`),
    ),
    SRTE.chain((cached) =>
      pipe(
        // validate the cached chain of details if they still represent the same path
        // a folder might be renamed or moved and another folder with the same name is created instead
        validateCachedHierarchies(
          pipe(cached, NA.map(_ => _.details)),
        ),
        SRTE.map(NA.zip(cached)),
        SRTE.map(NA.map(([validated, cached]) => concatCachedWithValidated(cached, validated))),
      )
    ),
    SRTE.map(NA.zip(paths)),
    SRTE.chain(getActuals),
  );

/**
Given cached root and a cached hierarchy determine which part of the hierarchy is unchanged
 */
const validateCachedHierarchies = <R extends Types.Root>(
  cachedHierarchies: NEA<GetByPath.Hierarchy<R>>,
): DriveLookup.Lookup<NEA<GetByPath.Result<R>>> => {
  const toActual = (
    cachedPath: Types.NonRootDetails[],
    actualsRecord: Record<string, O.Option<Types.NonRootDetails>>,
  ): O.Option<Types.NonRootDetails>[] => {
    return pipe(
      cachedPath,
      A.map(h => R.lookup(h.drivewsid)(actualsRecord)),
      A.map(O.flatten),
    );
  };

  const cachedRoot = GetByPath.root(NA.head(cachedHierarchies));
  const cachedRests = pipe(cachedHierarchies, NA.map(GetByPath.tail));

  const drivewsids = pipe(
    A.flatten(cachedRests),
    A.uniq(equalsDrivewsId()),
    A.map(_ => _.drivewsid),
  );

  return pipe(
    loggerIO.debug(`validateHierarchies: [${cachedHierarchies.map(showHierarchiy)}]`),
    SRTE.fromIO,
    SRTE.chain(() =>
      // retrieve details from api or from temp cache
      DriveLookup.retrieveItemDetailsInFoldersTempCached<R>([
        cachedRoot.drivewsid,
        ...drivewsids,
      ])
    ),
    SRTE.map(([actualRoot, ...actualRest]) => {
      const detailsRecord = recordFromTuples(
        A.zip(drivewsids, actualRest),
      );

      return pipe(
        cachedRests,
        NA.map(cachedPath =>
          getValidHierarchyPart(
            [cachedRoot, ...cachedPath],
            [actualRoot.value, ...toActual(cachedPath, detailsRecord)],
          )
        ),
      );
    }),
  );
};

const concatCachedWithValidated = <R extends Types.Root>(
  cached: GetByPath.Result<R>,
  validated: GetByPath.PathValidation<R>,
): GetByPath.PathValidation<R> => {
  // if cached is valid
  if (cached.valid) {
    // and its validation is valid
    if (GetByPath.isValidPath(validated)) {
      // if original path was targeting a file
      // try to find it in the actual details
      const file = GetByPath.tryGetFile(cached);

      if (O.isSome(file)) {
        const fname = Types.fileName(file.value);
        const parent = NA.last(validated.details);

        return pipe(
          findInParentFilename(parent, Types.fileName(file.value)),
          O.fold(
            () => E.left(NotFoundError.createTemplate({ item: fname, container: parent.drivewsid })),
            (actualFileItem) =>
              // if a folder with the same name as the file was found
              Types.isFileItem(actualFileItem)
                ? E.of(actualFileItem)
                : E.left(ItemIsNotFileError.createTemplate(actualFileItem)),
          ),
          E.foldW(
            (e) => GetByPath.invalidPath(validated.details, [fname], e),
            file => GetByPath.validPath(validated.details, O.some(file)),
          ),
        );
      } else {
        // if not a file was targeted then the cached path is still valid
        loggerIO.debug(`V.validResult: ${showDetails(NA.last(validated.details))}`)();
        return GetByPath.validPath(validated.details);
      }
    } else {
      // return what is actually valid currently
      return validated;
    }
  } else {
    // cached path is invalid
    if (GetByPath.isValidPath(validated)) {
      return GetByPath.invalidPath(validated.details, cached.rest, cached.error);
    } else {
      return GetByPath.invalidPath(
        validated.details,
        NA.concat(cached.rest)(validated.rest),
        err(`the path changed`),
      );
    }
  }
};

/** Given the most valid parts of the paths, try to retrieve the rest */
const getActuals = <R extends Types.Root>(
  validationResults: NEA<[GetByPath.PathValidation<R>, NormalizedPath]>,
): DriveLookup.Lookup<NEA<GetByPath.PathValidation<R>>> => {
  loggerIO.debug(
    `getActuals: ${
      validationResults.map(([p, path]) => `for ${path}. so far we have: ${GetByPath.showGetByPathResult(p)}`)
    }`,
  )();
  return pipe(
    modifySubset(
      validationResults,
      guardFst(GetByPath.isInvalidPath),
      (invalidPaths) => pipe(invalidPaths, NA.map(fst), handleInvalidPaths),
      ([h, p]): GetByPath.Result<R> => h,
    ),
  );
};

type DeeperFolders<R extends Types.Root> =
  // folders items with empty rest (valid, requires one last details)
  | [
    lastitem: O.Some<Types.DriveChildrenItemFolder | Types.DriveChildrenItemAppLibrary>,
    [rest: [], invalidPath: GetByPath.PathInvalid<R>],
  ]
  // folders items with non empty rest (incomplete paths)
  | [
    nextitem: O.Some<Types.DriveChildrenItemFolder | Types.DriveChildrenItemAppLibrary>,
    [rest: NEA<string>, invalidPath: GetByPath.PathInvalid<R>],
  ];

const handleInvalidPaths = <R extends Types.Root>(
  invalidPaths: NEA<GetByPath.PathInvalid<R>>,
): DriveLookup.Lookup<NEA<GetByPath.PathValidation<R>>> => {
  loggerIO.debug(`handleInvalidPaths: ${invalidPaths.map(GetByPath.showGetByPathResult)}`)();

  const handleSubfolders = <R extends Types.Root>(
    subfolders: NEA<DeeperFolders<R>>,
  ): DriveLookup.Lookup<NEA<GetByPath.Result<R>>> => {
    loggerIO.debug(`handleSubfolders: ${
      subfolders.map(([item, [rest, partial]]) => {
        return `item: ${Types.fileName(item.value)}. rest: [${rest}]`;
      })
    }`)();

    const foldersToRetrieve = pipe(
      subfolders,
      NA.map(([item, [rest, validPart]]) => item.value.drivewsid),
    );

    return pipe(
      DriveLookup.retrieveItemDetailsInFoldersTempCachedStrict(foldersToRetrieve),
      SRTE.map(NA.zip(subfolders)),
      SRTE.chain((details) => {
        return modifySubset(
          details,
          // select
          (v): v is [
            Types.NonRootDetails,
            [
              O.Some<
                Types.DriveChildrenItemFolder | Types.DriveChildrenItemAppLibrary
              >,
              [NEA<string>, GetByPath.PathInvalid<R>],
            ],
          ] => pipe(v, ([details, [item, [rest, partial]]]) => A.isNonEmpty(rest)),
          // when
          (task) => {
            return pipe(
              task,
              NA.map(([details, [item, [rest, partial]]]): GetByPath.PathInvalid<R> =>
                GetByPath.invalidPath(
                  GetByPath.appendHierarchy(partial.details, [details]),
                  rest,
                  err(`we need to go deepr)`),
                )
              ),
              handleInvalidPaths,
            );
          },
          // when the last item of the path is received, return the valid path
          ([details, [item, [rest, partial]]]): GetByPath.PathValid<R> => {
            return GetByPath.validFolder(GetByPath.appendHierarchy(partial.details, [details]));
          },
        );
      }),
    );
  };

  const handleFiles = <R extends Types.Root>() =>
    (
      [item, [rest, partial]]: [
        O.Some<Types.DriveChildrenItemFile>,
        [string[], GetByPath.PathInvalid<R>],
      ],
    ): GetByPath.PathValidation<R> => {
      return pipe(
        rest,
        A.match(
          (): GetByPath.PathValid<R> => GetByPath.validPath(partial.details, item),
          (rest): GetByPath.PathValidation<R> => ({
            valid: false,
            error: ItemIsNotFolderError.create(`item is not folder`),
            details: partial.details,
            rest: NA.concat([Types.fileName(item.value)], rest),
          }),
        ),
      );
    };

  const handleFoundItems = <R extends Types.Root>(
    found: NEA<[O.Some<Types.DriveChildrenItem>, [string[], GetByPath.PathInvalid<R>]]>,
  ): DriveLookup.Lookup<GetByPath.Result<R>[]> => {
    loggerIO.debug(`handleFoundItems. ${
      found.map(([item, [rest, partial]]) => {
        return `item: ${Types.fileName(item.value)}.`;
      })
    }`)();

    const selectFolders = (
      v: [O.Some<Types.DriveChildrenItem>, [string[], GetByPath.PathInvalid<R>]],
    ): v is DeeperFolders<R> => Types.isFolderLikeItem(v[0].value);

    if (A.isNonEmpty(found)) {
      return modifySubset(
        found,
        selectFolders,
        handleSubfolders,
        handleFiles(),
      );
    }

    return SRTE.of([]);
  };

  const nextItems = pipe(
    invalidPaths,
    NA.map(_ => findInParentFilename(NA.last(_.details), NA.head(_.rest))),
    NA.zip(pipe(invalidPaths, NA.map(_ => NA.tail(_.rest)), NA.zip(invalidPaths))),
  );

  return modifySubset(
    nextItems,
    // select items that were found
    (v): v is [O.Some<Types.DriveChildrenItem>, [string[], GetByPath.PathInvalid<R>]] => pipe(v, fst, O.isSome),
    handleFoundItems,
    ([item, [rest, partial]]): GetByPath.Result<R> => {
      // : [O.None, [string[], V.PathInvalid<H.Hierarchy<R>>]]
      return {
        valid: false,
        error: NotFoundError.createTemplate(
          {
            item: NA.head(partial.rest),
            container: Types.fileName(NA.last(partial.details)),
            prefix: "getByPaths.handleInvalidPaths",
          },
        ),
        details: partial.details,
        rest: partial.rest,
      };
    },
  );
};

const getValidHierarchyPart = <R extends Types.Root>(
  cachedHierarchy: GetByPath.Hierarchy<R>,
  actualDetails: [R, ...O.Option<Types.NonRootDetails>[]],
): GetByPath.PathValidation<R> => {
  const [actualRoot, ...actualPath] = actualDetails;
  const [cachedroot, ...cachedPath] = cachedHierarchy;

  const actualPathDetails = pipe(
    actualPath,
    A.takeLeftWhile(O.isSome),
    A.map(_ => _.value),
  );

  return pipe(
    A.zip(actualPathDetails, cachedPath),
    A.takeLeftWhile(([a, b]) => GetByPath.isSameDetails(a, b)),
    _ => ({
      validPart: A.takeLeft(_.length)(actualPathDetails),
      rest: pipe(
        cachedPath,
        A.dropLeft(_.length),
        A.map(Types.fileName),
      ),
    }),
    ({ validPart, rest }) =>
      pipe(
        rest,
        A.matchW(
          () => GetByPath.validPath([actualRoot, ...validPart]),
          rest => GetByPath.invalidPath([actualRoot, ...validPart], rest, err(`details changed`)),
        ),
      ),
  );
};

const showHierarchiy = (h: GetByPath.Hierarchy<Types.Root>): string => {
  const [root, ...rest] = h;

  return `${Types.isCloudDocsRootDetails(root) ? "root" : "trash"}/${rest.map(Types.fileName).join("/")}`;
};

const showDetails = (details: Types.Details) => {
  return `${Types.isTrashDetailsG(details) ? "TRASH_ROOT" : details.type} ${Types.fileName(details)}. items: [${
    details.items.map(Types.fileName)
  }]`;
};
