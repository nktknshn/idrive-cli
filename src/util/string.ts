/** Adds a trailing newline if the string does not end with a newline */
export const addTrailingNewline = (s: string): string => s.endsWith('\n') ? s : s + '\n'
