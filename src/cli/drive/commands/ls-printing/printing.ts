import * as A from "fp-ts/lib/Array";
import { pipe } from "fp-ts/lib/function";

import * as Ord from "fp-ts/lib/Ord";
import { DriveActions, GetByPath, Types } from "../../../../icloud-drive";
import {
  ordDriveChildrenItemByDate,
  ordDriveChildrenItemByName,
  ordDriveChildrenItemBySize,
  ordDriveChildrenItemByType,
  ordIsFolder,
} from "../../../../icloud-drive/drive-types";
import { Path } from "../../../../util/path";
import { sizeHumanReadable } from "../../../../util/size-human-readable";

export type Sort = "name" | "size" | "date";

export const showInvalidPath = (path: GetByPath.PathInvalid<Types.Root>) => {
  return GetByPath.showGetByPathResult(path);
};

export type ShowDetailsInfoParams = {
  fullPath: boolean;
  long: number;
  humanReadable: boolean;
  info: boolean;
  sort: Sort;
};

// formating like ls -l
// Aug 30 08:41
// Sep  2 19:14
// Sep  3  2023
export const formatDate = (dateOrStr: Date | string) => {
  const date = typeof dateOrStr === "string" ? new Date(dateOrStr) : dateOrStr;

  const isCurrentYear = date.getFullYear() == new Date().getFullYear();

  if (isCurrentYear) {
    return [
      // month
      date.toDateString().slice(4, 7),
      // day
      date.toDateString().slice(8, 10).replace(/^0/, "").padStart(2),
      // time
      date.toTimeString().substring(0, 5),
    ].join(" ");
  }

  return [
    // month
    date.toDateString().slice(4, 7),
    // day
    date.toDateString().slice(8, 10).replace(/^0/, "").padStart(2),
    // year
    date.getFullYear().toString().padStart(5),
  ].join(" ");
};

// TODO function to show bunch of items
// export const showItems = (
//   items: Types.DriveChildrenItem[],
//   path: string,
//   { long, fullPath }: { long: number; fullPath: boolean },
// ): string => {
// }

export const getOrds = (sort: Sort): Ord.Ord<Types.DriveChildrenItem>[] =>
  sort === "date"
    ? [
      Ord.reverse(ordDriveChildrenItemByDate),
    ]
    : sort === "size"
    ? [
      // APP_LIBRARY, FOLDER, FILE
      Ord.reverse(ordIsFolder),
      ordDriveChildrenItemByType,
      ordDriveChildrenItemBySize,
    ]
    : // sort === "name"
      [
        // APP_LIBRARY, FOLDER, FILE
        Ord.reverse(ordIsFolder),
        ordDriveChildrenItemByType,
        ordDriveChildrenItemByName,
      ];

export const sortItems = (items: Types.DriveChildrenItem[], sort: Sort) => pipe(items, A.sortBy(getOrds(sort)));

export const showItem = (
  item: Types.DriveChildrenItem,
  path: string,
  widths: {
    filenameWidth: number;
    typeWidth: number;
    sizeWidth: number;
  },
  { long, fullPath, humanReadable }: { long: number; fullPath: boolean; humanReadable: boolean },
): string => {
  let fname = fullPath
    ? Path.join(path, Types.fileName(item))
    : Types.fileName(item);

  if (item.type !== "FILE") {
    fname += "/";
  }

  if (long == 0) {
    return fname;
  }

  const col = (s: string, n = 20) => s.padEnd(n);

  if (item.type === "FILE") {
    const sizeStr = humanReadable
      ? sizeHumanReadable(item.size)
      : item.size.toString();

    const output = ""
      + col(item.type, widths.typeWidth + 2)
      //
      + col(formatDate(item.dateModified), 14)
      + sizeStr.padStart(widths.sizeWidth) + " "
      + col(fname, widths.filenameWidth) + "  ";

    if (long == 1) {
      return output;
    }

    if (long == 2) {
      return output
        + item.etag.padEnd("b73::b72".length) + "  "
        + col(item.drivewsid);
    }
  }

  if (item.type !== "FILE") {
    const output = ""
      + col(item.type, widths.typeWidth + 2)
      + col(formatDate(item.dateCreated), 14)
      + col("", widths.sizeWidth + 1)
      + col(fname, widths.filenameWidth) + "  ";

    if (long == 1) {
      return output;
    }

    if (long == 2) {
      return output
        + item.etag.padEnd("b73::b72".length) + "  "
        + col(item.drivewsid);
    }
  }

  return Types.fileName(item);
};

export const maxSize = (items: Types.DriveChildrenItem[]) =>
  pipe(
    items,
    A.filter(Types.isFile),
    A.map(_ => _.size),
    A.reduce(0, Math.max),
  );

export const longestSizeHumanReadable = (items: Types.DriveChildrenItem[]) =>
  pipe(
    items,
    A.filter(Types.isFile),
    A.map(_ => sizeHumanReadable(_.size)),
    A.reduce(0, (a, b) => Math.max(a, b.length)),
  );

export const sizeWidth = (items: Types.DriveChildrenItem[], hr = false) => {
  if (hr) {
    return longestSizeHumanReadable(items);
  }

  return maxSize(items).toString().length;
};

export const typeWidth = (items: Types.DriveChildrenItem[]) =>
  pipe(
    items,
    A.map(_ => _.type.length),
    A.reduce(0, Math.max),
  );

export const filenameWidth = (items: Types.DriveChildrenItem[]) =>
  pipe(items, A.map(Types.fileName), A.map(_ => _.length), A.reduce(0, Math.max));

export const showDetailsInfo = (details: Types.Details, path: string) =>
  (params: ShowDetailsInfoParams) => {
    let result = "";
    const column = (s: string) => s.padEnd(20);

    // process trash root separately
    if (Types.isTrashDetailsG(details)) {
      if (params.info) {
        result += `${column("Drivewsid")}${details.drivewsid}\n`;
        result += `${column("Number of items")}${details.numberOfItems}\n`;
        result += "\n";
      }
    } else {
      if (params.info) {
        result += `${column("Type")}${details.type}\n`;
        result += `${column("Name")}${Types.fileName(details)}\n`;
        if (details.extension !== undefined) {
          result += `${column("Extension")}${details.extension}\n`;
        }
        result += `${column("Zone")}${details.zone}\n`;
        result += `${column("Drivewsid")}${details.drivewsid}\n`;
        result += `${column("Docwsid")}${details.docwsid}\n`;
        result += `${column("Etag")}${details.etag}\n`;
        if (!Types.isCloudDocsRootDetails(details)) {
          result += `${column("Parent ID")}${details.parentId}\n`;
        }
        result += `${column("Number of items")}${details.numberOfItems}\n`;
        result += `${column("Date created")}${details.dateCreated}\n`;

        if (details.restorePath !== undefined) {
          result += `${column("Restore path")}${details.restorePath}\n`;
        }
        result += "\n";
      }
    }

    const items = sortItems(details.items, params.sort);

    let fw = filenameWidth(items);
    const sw = sizeWidth(items, params.humanReadable);
    const tw = typeWidth(items);

    if (params.fullPath) {
      fw += path.length + 1;
    }

    for (const item of items) {
      result += showItem(item, path, {
        filenameWidth: fw,
        typeWidth: tw,
        sizeWidth: sw,
      }, params) + "\n";
    }

    return result;
  };

export const showFileInfo = (item: Types.DriveChildrenItemFile, path: string) =>
  (params: ShowDetailsInfoParams) => {
    let result = "";
    const col = (s: string) => s.padEnd(20);

    if (params.info) {
      result += `${col("Type")}${item.type}\n`;
      result += `${col("Full name")}${Types.fileName(item)}\n`;
      if (item.extension !== undefined) {
        result += `${col("Extension")}${item.extension}\n`;
      }
      result += `${col("Size")}${params.humanReadable ? sizeHumanReadable(item.size) : item.size}\n`;
      result += `${col("Date created")}${item.dateCreated}\n`;
      result += `${col("Date modified")}${item.dateModified}\n`;
      result += `${col("Date changed")}${item.dateChanged}\n`;
      result += `${col("Drivewsid")}${item.drivewsid}\n`;
      result += `${col("Docwsid")}${item.docwsid}\n`;
      result += `${col("Etag")}${item.etag}\n`;
      result += `${col("Zone")}${item.zone}\n`;
      result += `${col("Parent ID")}${item.parentId}\n`;
      if (item.restorePath !== undefined) {
        result += `${col("Restore path")}${item.restorePath}\n`;
      }
      result += "\n";
    }

    result += showItem(item, path, {
      filenameWidth: item.name.length,
      sizeWidth: sizeWidth([item], params.humanReadable),
      typeWidth: 4,
    }, params);

    return result;
  };

export const showValidPath = (res: DriveActions.ListPathsFolder | DriveActions.ListPathsFile) => {
  const path = GetByPath.pathString(res.validation);

  if (res.isFile) {
    return showFileInfo(res.item, path);
  }

  return showDetailsInfo({ ...res.parentItem, items: res.items }, path);
};
