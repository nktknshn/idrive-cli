import { pipe } from "fp-ts/lib/function";

/** Adds a trailing newline if the string does not end with a newline */
export const addTrailingNewline = (s: string): string => s.endsWith("\n") ? s : s + "\n";

export const removeTrailingNewlines = (s: string): string => s.replace(/\n+$/, "");

export const ensureSingleNewline = (s: string): string => pipe(s, removeTrailingNewlines, addTrailingNewline);

export const maxLength = (strings: string[]): number => Math.max(...strings.map(s => s.length));
