/** Adds a trailing newline if the string does not end with a newline */
export const addTrailingNewline = (s: string): string => s.endsWith('\n') ? s : s + '\n'

export const ensureSingleNewline = (s: string): string => addTrailingNewline(s.replace(/\n+/g, '\n'))
