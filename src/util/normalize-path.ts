import { pipe } from "fp-ts/lib/function";
import { Path } from "./path";
import { NEA } from "./types";

declare const _brand: unique symbol;

export interface Brand<B> {
  readonly [_brand]: B;
}

export interface NormalizedPathBrand {
  readonly NormalizedPath: unique symbol;
}

export type Branded<A, B> = A & Brand<B>;
/**
 * NormalizedPath has Path.normalize applied and no trailing slash
 */

export type NormalizedPath = Branded<string, NormalizedPathBrand>;

/** Removes a trailing slash if the path has one */
export const stripTrailingSlash = (s: string): string => s == "/" ? s : s.replace(/\/$/, "");

/** Adds a leading slash if the path does not already have one */
export const addLeadingSlash = (s: string): string => s.startsWith("/") ? s : `/${s}`;

/** Adds a trailing slash if the path does not already have one */
export const addTrailingSlash = (s: string): string => s.endsWith("/") ? s : `${s}/`;

/** NormalizedPath has Path.normalize applied and no trailing slash */
export const normalizePath = (path: string): NormalizedPath => {
  return pipe(
    Path.normalize(path),
    stripTrailingSlash,
    addLeadingSlash,
  ) as NormalizedPath;
};

export function normalizePaths(paths: NEA<string>): NEA<NormalizedPath>;
export function normalizePaths(paths: string[]): NormalizedPath[] {
  return paths.map(normalizePath);
}

export const npath = normalizePath;
