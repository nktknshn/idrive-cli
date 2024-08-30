/** Prints to the console */
export const printerIO = {
  print: <T>(value: T) =>
    (): void => {
      printer.print(value)
    },
  error: () =>
    (value: Error | string) =>
      (): void => {
        printer.error(value)
      },
  printTask: <T>(value: T): () => Promise<void> =>
    async () => {
      printer.print(value)
    },
  errorTask: (value: Error): () => Promise<void> =>
    async () => {
      printer.error(value.message)
    },
}

/** Prints to the console */
export const printer = {
  print: <T>(value: T): void => {
    console.log(value)
  },
  error: (value: Error | string): void => {
    console.error(value)
  },
  printTask: <T>(value: T): () => Promise<void> =>
    async () => {
      console.log(value)
    },
  errorTask: (value: Error): () => Promise<void> =>
    async () => {
      console.error(value.message)
    },
}
